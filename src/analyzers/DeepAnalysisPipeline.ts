import * as fs from 'fs';
import * as path from 'path';
import { getPool } from '../database/pool.js';
import { RepoCloner } from './RepoCloner.js';
import { CodeAnalyzer } from './CodeAnalyzer.js';
import { ArchitectureExtractor } from './ArchitectureExtractor.js';
import { CompetitiveReportGenerator } from './CompetitiveReport.js';
import { Pool } from 'pg';

export interface DeepAnalysisResult {
  success: boolean;
  discoveryId: number;
  analysis?: {
    languages: Record<string, number>;
    totalLOC: number;
    fileCount: number;
    frameworks: string[];
    architecturePattern: string;
    hasCICD: boolean;
    hasTests: boolean;
    hasDocker: boolean;
    hasAIDeps: boolean;
    dependencyCount: number;
    aiSummary: string;
  };
  error?: string;
  durationMs: number;
}

export class DeepAnalysisPipeline {
  private cloner: RepoCloner;
  private codeAnalyzer: CodeAnalyzer;
  private archExtractor: ArchitectureExtractor;
  private reportGen: CompetitiveReportGenerator;
  private pool: Pool;

  constructor() {
    this.cloner = new RepoCloner();
    this.codeAnalyzer = new CodeAnalyzer();
    this.archExtractor = new ArchitectureExtractor();
    this.reportGen = new CompetitiveReportGenerator();
    this.pool = getPool();
  }

  /**
   * Run deep analysis on a discovery
   */
  async analyze(discoveryId: number): Promise<DeepAnalysisResult> {
    const startTime = Date.now();

    try {
      // 1. Get discovery from DB
      const disc = await this.getDiscovery(discoveryId);
      if (!disc) {
        return { success: false, discoveryId, error: 'Discovery not found', durationMs: Date.now() - startTime };
      }

      // Skip non-GitHub URLs
      if (!disc.url || !disc.url.includes('github.com')) {
        return { success: false, discoveryId, error: 'Not a GitHub URL', durationMs: Date.now() - startTime };
      }

      // Check if already analyzed
      const existing = await this.pool.query(
        'SELECT id FROM deep_analyses WHERE discovery_id = $1',
        [discoveryId]
      );
      if (existing.rows.length > 0) {
        console.log(`  ⏭️  Already analyzed discovery ${discoveryId}`);
        return { success: true, discoveryId, durationMs: Date.now() - startTime };
      }

      console.log(`\n🔬 Deep Analysis: ${disc.title}`);
      console.log(`   URL: ${disc.url}`);

      // 2. Clone repository
      const cloneResult = await this.cloner.clone(disc.url);
      if (!cloneResult.success) {
        return { success: false, discoveryId, error: `Clone failed: ${cloneResult.error}`, durationMs: Date.now() - startTime };
      }

      try {
        // 3. Code analysis
        console.log('  📊 Analyzing code...');
        const codeAnalysis = this.codeAnalyzer.analyze(cloneResult.localPath);

        // 4. Architecture extraction
        console.log('  🏗️  Extracting architecture...');
        const archAnalysis = this.archExtractor.extract(cloneResult.localPath);

        // 5. Read README for context
        const readme = this.readReadme(cloneResult.localPath);

        // 6. AI competitive analysis
        console.log('  🤖 Generating competitive analysis...');
        const report = await this.reportGen.generate(
          disc.title,
          disc.description || '',
          codeAnalysis,
          archAnalysis,
          readme
        );

        // 7. Store in database
        const aiSummary = `${report.summary}\n\nStrengths: ${report.strengths.join('; ')}\n\nWeaknesses: ${report.weaknesses.join('; ')}\n\nMarket Impact: ${report.marketImpact}\n\nRecommendation: ${report.recommendation}`;

        await this.pool.query(`
          INSERT INTO deep_analyses (
            discovery_id, repo_url, languages, total_loc, file_count,
            frameworks, architecture_pattern, has_ci_cd, has_tests,
            has_docker, has_ai_deps, dependency_count, dependencies,
            readme_summary, ai_competitive_analysis, clone_size_mb,
            analysis_duration_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          discoveryId,
          disc.url,
          JSON.stringify(codeAnalysis.languages),
          codeAnalysis.totalLOC,
          codeAnalysis.fileCount,
          JSON.stringify(archAnalysis.frameworks),
          archAnalysis.architecturePattern,
          archAnalysis.hasCICD,
          archAnalysis.hasTests,
          archAnalysis.hasDocker,
          archAnalysis.hasAIDeps,
          archAnalysis.dependencyCount,
          JSON.stringify(archAnalysis.dependencies.slice(0, 50)),
          readme?.substring(0, 500) || null,
          aiSummary,
          cloneResult.sizeMB,
          Date.now() - startTime,
        ]);

        const durationMs = Date.now() - startTime;
        console.log(`  ✅ Deep analysis complete (${(durationMs / 1000).toFixed(1)}s)`);
        console.log(`     ${codeAnalysis.totalLOC.toLocaleString()} LOC | ${archAnalysis.frameworks.join(', ')} | ${archAnalysis.architecturePattern}`);

        return {
          success: true,
          discoveryId,
          analysis: {
            languages: codeAnalysis.languages,
            totalLOC: codeAnalysis.totalLOC,
            fileCount: codeAnalysis.fileCount,
            frameworks: archAnalysis.frameworks,
            architecturePattern: archAnalysis.architecturePattern,
            hasCICD: archAnalysis.hasCICD,
            hasTests: archAnalysis.hasTests,
            hasDocker: archAnalysis.hasDocker,
            hasAIDeps: archAnalysis.hasAIDeps,
            dependencyCount: archAnalysis.dependencyCount,
            aiSummary,
          },
          durationMs,
        };

      } finally {
        // Always cleanup clone
        this.cloner.cleanup(cloneResult.localPath);
      }

    } catch (error: any) {
      return {
        success: false,
        discoveryId,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Analyze all HIGH+ discoveries that haven't been deeply analyzed yet
   */
  async analyzeUnprocessed(limit: number = 10): Promise<DeepAnalysisResult[]> {
    const results: DeepAnalysisResult[] = [];

    // Find HIGH+ GitHub discoveries without deep analysis
    const { rows } = await this.pool.query(`
      SELECT d.id
      FROM discoveries d
      LEFT JOIN deep_analyses da ON da.discovery_id = d.id
      WHERE da.id IS NULL
        AND d.url LIKE '%github.com%'
        AND (d.threat_score >= 6.0 OR d.intelligence_level IN ('HIGH', 'CRITICAL'))
      ORDER BY d.threat_score DESC
      LIMIT $1
    `, [limit]);

    if (rows.length === 0) {
      console.log('  ℹ️  No unprocessed discoveries to analyze');
      return results;
    }

    console.log(`\n🔬 Deep Analysis: ${rows.length} discoveries to process`);

    for (const row of rows) {
      const result = await this.analyze(row.id);
      results.push(result);

      // Small delay between analyses to be nice to GitHub
      if (rows.indexOf(row) < rows.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Cleanup stale clones
    this.cloner.cleanupStale();

    const successful = results.filter(r => r.success).length;
    console.log(`\n📊 Deep Analysis Summary: ${successful}/${results.length} successful`);

    return results;
  }

  private async getDiscovery(id: number) {
    const { rows } = await this.pool.query(
      'SELECT id, title, url, description, source, threat_score, intelligence_level FROM discoveries WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  private readReadme(repoPath: string): string | undefined {
    const readmeFiles = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README'];
    for (const rf of readmeFiles) {
      const fullPath = path.join(repoPath, rf);
      if (fs.existsSync(fullPath)) {
        try {
          return fs.readFileSync(fullPath, 'utf8');
        } catch { /* skip */ }
      }
    }
    return undefined;
  }
}
