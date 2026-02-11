import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CloneResult {
  success: boolean;
  localPath: string;
  sizeMB: number;
  error?: string;
}

export class RepoCloner {
  private clonesDir: string;
  private maxSizeMB: number;
  private retentionHours: number;

  constructor() {
    this.clonesDir = process.env.CLONES_DIRECTORY || '/opt/PROMETHEUS/rda/clones';
    this.maxSizeMB = parseInt(process.env.MAX_CLONE_SIZE_MB || '500');
    this.retentionHours = parseInt(process.env.CLONE_RETENTION_HOURS || '1');

    // Ensure clones directory exists
    if (!fs.existsSync(this.clonesDir)) {
      fs.mkdirSync(this.clonesDir, { recursive: true });
    }
  }

  /**
   * Clone a repository with depth=1 (shallow clone)
   */
  async clone(repoUrl: string): Promise<CloneResult> {
    const slug = this.urlToSlug(repoUrl);
    const localPath = path.join(this.clonesDir, slug);

    // Skip if already cloned recently
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (ageHours < this.retentionHours) {
        const sizeMB = this.getDirSizeMB(localPath);
        console.log(`  ♻️  Using existing clone: ${slug} (${sizeMB.toFixed(1)}MB, ${ageHours.toFixed(1)}h old)`);
        return { success: true, localPath, sizeMB };
      }
      // Stale clone — remove and re-clone
      this.cleanup(localPath);
    }

    try {
      console.log(`  📥 Cloning ${repoUrl} (shallow)...`);

      // Normalize URL to HTTPS
      const httpsUrl = this.normalizeUrl(repoUrl);

      // Shallow clone with timeout
      execSync(
        `git clone --depth 1 --single-branch "${httpsUrl}" "${localPath}"`,
        {
          timeout: 120000, // 2 min timeout
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        }
      );

      const sizeMB = this.getDirSizeMB(localPath);

      // Check size limit
      if (sizeMB > this.maxSizeMB) {
        console.log(`  ⚠️  Repo too large (${sizeMB.toFixed(1)}MB > ${this.maxSizeMB}MB), removing...`);
        this.cleanup(localPath);
        return { success: false, localPath: '', sizeMB, error: `Exceeds size limit: ${sizeMB.toFixed(1)}MB` };
      }

      console.log(`  ✅ Cloned: ${slug} (${sizeMB.toFixed(1)}MB)`);
      return { success: true, localPath, sizeMB };

    } catch (error: any) {
      console.log(`  ❌ Clone failed: ${error.message?.substring(0, 100)}`);
      this.cleanup(localPath);
      return { success: false, localPath: '', sizeMB: 0, error: error.message };
    }
  }

  /**
   * Clean up a cloned repository
   */
  cleanup(localPath: string): void {
    try {
      if (fs.existsSync(localPath)) {
        fs.rmSync(localPath, { recursive: true, force: true });
        console.log(`  🗑️  Cleaned up: ${path.basename(localPath)}`);
      }
    } catch (e) {
      console.warn(`  ⚠️  Cleanup failed for ${localPath}`);
    }
  }

  /**
   * Clean up all stale clones
   */
  cleanupStale(): void {
    if (!fs.existsSync(this.clonesDir)) return;

    const entries = fs.readdirSync(this.clonesDir);
    let cleaned = 0;

    for (const entry of entries) {
      const fullPath = path.join(this.clonesDir, entry);
      const stats = fs.statSync(fullPath);
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

      if (ageHours > this.retentionHours) {
        this.cleanup(fullPath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`  🧹 Cleaned up ${cleaned} stale clone(s)`);
    }
  }

  private urlToSlug(url: string): string {
    return url
      .replace(/https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\.git$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .toLowerCase();
  }

  private normalizeUrl(url: string): string {
    // Convert various formats to HTTPS
    if (url.startsWith('git@')) {
      url = url.replace('git@github.com:', 'https://github.com/');
    }
    if (!url.startsWith('http')) {
      url = `https://github.com/${url}`;
    }
    if (!url.endsWith('.git')) {
      url = `${url}.git`;
    }
    return url;
  }

  private getDirSizeMB(dirPath: string): number {
    try {
      const output = execSync(`du -sm "${dirPath}" 2>/dev/null`, { encoding: 'utf8' });
      return parseFloat(output.split('\t')[0]) || 0;
    } catch {
      return 0;
    }
  }
}
