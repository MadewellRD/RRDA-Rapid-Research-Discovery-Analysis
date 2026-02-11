#!/bin/bash
set -e

RDA_DIR="/opt/PROMETHEUS/production/rda-production"
cd "$RDA_DIR"

echo "═══════════════════════════════════════════════"
echo "  Step 5: RDA Deep Analysis Implementation"
echo "═══════════════════════════════════════════════"
echo ""

# ── 1. Create clones directory ──
echo "📁 Creating clones directory..."
sudo mkdir -p /opt/PROMETHEUS/rda/clones
sudo chown madewellrd:madewellrd /opt/PROMETHEUS/rda/clones

# ── 2. Create deep_analyses table ──
echo "🗄️  Creating deep_analyses table..."
psql "postgresql://rda_user:rda_secure_password_2026@localhost:5432/rda_intelligence" << 'SQL'
CREATE TABLE IF NOT EXISTS deep_analyses (
  id SERIAL PRIMARY KEY,
  discovery_id INTEGER REFERENCES discoveries(id) ON DELETE CASCADE,
  repo_url TEXT NOT NULL,
  languages JSONB DEFAULT '{}',
  total_loc INTEGER DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  frameworks JSONB DEFAULT '[]',
  architecture_pattern TEXT,
  has_ci_cd BOOLEAN DEFAULT false,
  has_tests BOOLEAN DEFAULT false,
  has_docker BOOLEAN DEFAULT false,
  has_ai_deps BOOLEAN DEFAULT false,
  dependency_count INTEGER DEFAULT 0,
  dependencies JSONB DEFAULT '[]',
  readme_summary TEXT,
  ai_competitive_analysis TEXT,
  clone_size_mb NUMERIC(10,2),
  analysis_duration_ms INTEGER,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(discovery_id)
);

CREATE INDEX IF NOT EXISTS idx_deep_analyses_discovery ON deep_analyses(discovery_id);
CREATE INDEX IF NOT EXISTS idx_deep_analyses_pattern ON deep_analyses(architecture_pattern);
CREATE INDEX IF NOT EXISTS idx_deep_analyses_date ON deep_analyses(analyzed_at);

-- View for easy querying
CREATE OR REPLACE VIEW competitive_intel AS
SELECT
  d.title,
  d.source,
  d.url,
  d.threat_score,
  d.intelligence_level,
  da.languages,
  da.total_loc,
  da.frameworks,
  da.architecture_pattern,
  da.has_ci_cd,
  da.has_tests,
  da.has_docker,
  da.has_ai_deps,
  da.dependency_count,
  da.ai_competitive_analysis,
  da.analyzed_at
FROM discoveries d
JOIN deep_analyses da ON da.discovery_id = d.id
ORDER BY d.threat_score DESC;

SELECT 'deep_analyses table created' AS status;
SQL

# ── 3. Create analyzers directory ──
echo "📂 Creating src/analyzers/..."
mkdir -p src/analyzers

# ── 4. RepoCloner.ts ──
echo "📄 Writing RepoCloner.ts..."
cat > src/analyzers/RepoCloner.ts << 'TYPESCRIPT'
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
TYPESCRIPT

# ── 5. CodeAnalyzer.ts ──
echo "📄 Writing CodeAnalyzer.ts..."
cat > src/analyzers/CodeAnalyzer.ts << 'TYPESCRIPT'
import * as fs from 'fs';
import * as path from 'path';

export interface CodeAnalysis {
  languages: Record<string, number>;  // language -> lines of code
  totalLOC: number;
  fileCount: number;
  topFiles: { path: string; lines: number }[];
}

// File extension to language mapping
const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
  '.py': 'Python',
  '.java': 'Java',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++',
  '.c': 'C', '.h': 'C',
  '.swift': 'Swift',
  '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.scala': 'Scala',
  '.r': 'R', '.R': 'R',
  '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell',
  '.html': 'HTML', '.htm': 'HTML',
  '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
  '.json': 'JSON',
  '.yaml': 'YAML', '.yml': 'YAML',
  '.md': 'Markdown',
  '.xml': 'XML',
  '.proto': 'Protocol Buffers',
  '.sol': 'Solidity',
  '.zig': 'Zig',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.ex': 'Elixir', '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.ml': 'OCaml',
  '.tf': 'Terraform',
  '.cob': 'COBOL', '.cbl': 'COBOL',
  '.f90': 'Fortran', '.f': 'Fortran',
};

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', 'vendor', 'dist', 'build', 'out',
  '__pycache__', '.next', '.nuxt', 'target', 'bin', 'obj',
  'coverage', '.idea', '.vscode', 'venv', '.env', 'env',
  '.tox', 'bower_components', '.cache',
]);

export class CodeAnalyzer {
  /**
   * Analyze code in a directory - count languages and LOC
   */
  analyze(repoPath: string): CodeAnalysis {
    const languages: Record<string, number> = {};
    const files: { path: string; lines: number; lang: string }[] = [];
    let totalLOC = 0;
    let fileCount = 0;

    this.walkDir(repoPath, repoPath, (filePath, ext) => {
      const lang = EXTENSION_MAP[ext];
      if (!lang) return;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0).length;

        languages[lang] = (languages[lang] || 0) + lines;
        totalLOC += lines;
        fileCount++;

        files.push({
          path: path.relative(repoPath, filePath),
          lines,
          lang,
        });
      } catch {
        // Skip unreadable files
      }
    });

    // Sort files by line count
    files.sort((a, b) => b.lines - a.lines);

    return {
      languages,
      totalLOC,
      fileCount,
      topFiles: files.slice(0, 20).map(f => ({ path: f.path, lines: f.lines })),
    };
  }

  private walkDir(
    basePath: string,
    currentPath: string,
    callback: (filePath: string, ext: string) => void
  ): void {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          this.walkDir(basePath, fullPath, callback);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) callback(fullPath, ext);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
}
TYPESCRIPT

# ── 6. ArchitectureExtractor.ts ──
echo "📄 Writing ArchitectureExtractor.ts..."
cat > src/analyzers/ArchitectureExtractor.ts << 'TYPESCRIPT'
import * as fs from 'fs';
import * as path from 'path';

export interface ArchitectureAnalysis {
  frameworks: string[];
  architecturePattern: 'monolith' | 'microservices' | 'serverless' | 'monorepo' | 'library' | 'cli' | 'unknown';
  hasCICD: boolean;
  hasTests: boolean;
  hasDocker: boolean;
  hasAIDeps: boolean;
  dependencyCount: number;
  dependencies: string[];
  buildTools: string[];
  signals: string[];  // human-readable explanations
}

interface DepSignal {
  dep: string;
  framework: string;
}

const FRAMEWORK_SIGNALS: DepSignal[] = [
  // Frontend
  { dep: 'next', framework: 'Next.js' },
  { dep: 'react', framework: 'React' },
  { dep: 'vue', framework: 'Vue.js' },
  { dep: '@angular/core', framework: 'Angular' },
  { dep: 'svelte', framework: 'Svelte' },
  { dep: 'nuxt', framework: 'Nuxt.js' },
  { dep: 'gatsby', framework: 'Gatsby' },
  { dep: 'remix', framework: 'Remix' },
  { dep: 'astro', framework: 'Astro' },
  // Backend
  { dep: 'express', framework: 'Express.js' },
  { dep: 'fastify', framework: 'Fastify' },
  { dep: '@nestjs/core', framework: 'NestJS' },
  { dep: 'hono', framework: 'Hono' },
  { dep: 'koa', framework: 'Koa' },
  { dep: 'fastapi', framework: 'FastAPI' },
  { dep: 'flask', framework: 'Flask' },
  { dep: 'django', framework: 'Django' },
  { dep: 'spring-boot', framework: 'Spring Boot' },
  // Database
  { dep: 'prisma', framework: 'Prisma' },
  { dep: 'typeorm', framework: 'TypeORM' },
  { dep: 'drizzle-orm', framework: 'Drizzle' },
  { dep: 'mongoose', framework: 'Mongoose' },
  { dep: 'sequelize', framework: 'Sequelize' },
  { dep: 'pg', framework: 'PostgreSQL' },
  { dep: 'mysql2', framework: 'MySQL' },
  { dep: 'redis', framework: 'Redis' },
  { dep: 'ioredis', framework: 'Redis' },
  // AI/ML
  { dep: 'openai', framework: 'OpenAI' },
  { dep: '@anthropic-ai/sdk', framework: 'Anthropic' },
  { dep: 'langchain', framework: 'LangChain' },
  { dep: '@langchain/core', framework: 'LangChain' },
  { dep: 'llamaindex', framework: 'LlamaIndex' },
  { dep: 'transformers', framework: 'Hugging Face' },
  { dep: 'tensorflow', framework: 'TensorFlow' },
  { dep: 'torch', framework: 'PyTorch' },
  { dep: '@huggingface/inference', framework: 'Hugging Face' },
  { dep: 'ollama', framework: 'Ollama' },
  { dep: 'ai', framework: 'Vercel AI SDK' },
  // Infrastructure
  { dep: '@aws-sdk', framework: 'AWS SDK' },
  { dep: '@google-cloud', framework: 'Google Cloud' },
  { dep: '@azure', framework: 'Azure' },
  { dep: 'serverless', framework: 'Serverless Framework' },
  // Testing
  { dep: 'jest', framework: 'Jest' },
  { dep: 'vitest', framework: 'Vitest' },
  { dep: 'mocha', framework: 'Mocha' },
  { dep: 'playwright', framework: 'Playwright' },
  { dep: 'cypress', framework: 'Cypress' },
  { dep: 'pytest', framework: 'PyTest' },
  // Message queues
  { dep: 'kafkajs', framework: 'Kafka' },
  { dep: 'amqplib', framework: 'RabbitMQ' },
  { dep: 'bullmq', framework: 'BullMQ' },
];

const AI_DEPS = new Set([
  'openai', '@anthropic-ai/sdk', 'langchain', '@langchain/core',
  'llamaindex', 'transformers', 'tensorflow', 'torch',
  '@huggingface/inference', 'ollama', 'ai', 'cohere-ai',
  '@google/generative-ai', 'replicate',
]);

export class ArchitectureExtractor {
  /**
   * Extract architecture patterns from a cloned repository
   */
  extract(repoPath: string): ArchitectureAnalysis {
    const signals: string[] = [];
    const frameworks: Set<string> = new Set();
    const allDeps: Set<string> = new Set();
    const buildTools: string[] = [];
    let hasAIDeps = false;

    // ── Parse package.json (Node.js) ──
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        for (const depName of Object.keys(deps)) {
          allDeps.add(depName);

          // Check AI deps
          if (AI_DEPS.has(depName) || depName.startsWith('@langchain/')) {
            hasAIDeps = true;
          }

          // Match frameworks
          for (const signal of FRAMEWORK_SIGNALS) {
            if (depName === signal.dep || depName.startsWith(signal.dep + '/') || depName.startsWith('@' + signal.dep)) {
              frameworks.add(signal.framework);
            }
          }
        }

        signals.push(`package.json: ${Object.keys(deps).length} dependencies`);
      } catch { /* invalid JSON */ }
    }

    // ── Parse requirements.txt / pyproject.toml (Python) ──
    const reqPath = path.join(repoPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const reqs = fs.readFileSync(reqPath, 'utf8').split('\n')
          .filter(l => l.trim() && !l.startsWith('#'))
          .map(l => l.split('=')[0].split('>')[0].split('<')[0].trim());

        for (const dep of reqs) {
          allDeps.add(dep);
          for (const signal of FRAMEWORK_SIGNALS) {
            if (dep.toLowerCase() === signal.dep.toLowerCase()) {
              frameworks.add(signal.framework);
            }
          }
          if (AI_DEPS.has(dep.toLowerCase())) hasAIDeps = true;
        }
        signals.push(`requirements.txt: ${reqs.length} packages`);
      } catch { /* ignore */ }
    }

    // ── Detect CI/CD ──
    const hasCICD = this.detectCICD(repoPath, signals);

    // ── Detect Docker ──
    const hasDocker = this.detectDocker(repoPath, signals);

    // ── Detect Tests ──
    const hasTests = this.detectTests(repoPath, signals);

    // ── Detect Build Tools ──
    this.detectBuildTools(repoPath, buildTools, signals);

    // ── Determine Architecture Pattern ──
    const architecturePattern = this.detectArchitecture(repoPath, frameworks, signals);

    // AI deps signal
    if (hasAIDeps) signals.push('🤖 AI/LLM dependencies detected');

    return {
      frameworks: Array.from(frameworks),
      architecturePattern,
      hasCICD,
      hasTests,
      hasDocker,
      hasAIDeps,
      dependencyCount: allDeps.size,
      dependencies: Array.from(allDeps).slice(0, 50), // Top 50
      buildTools,
      signals,
    };
  }

  private detectCICD(repoPath: string, signals: string[]): boolean {
    const ciPaths = [
      '.github/workflows',
      '.gitlab-ci.yml',
      'Jenkinsfile',
      '.circleci/config.yml',
      '.travis.yml',
      'bitbucket-pipelines.yml',
      '.buildkite',
    ];

    for (const ciPath of ciPaths) {
      const fullPath = path.join(repoPath, ciPath);
      if (fs.existsSync(fullPath)) {
        signals.push(`CI/CD: ${ciPath}`);
        return true;
      }
    }
    return false;
  }

  private detectDocker(repoPath: string, signals: string[]): boolean {
    const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml'];
    for (const df of dockerFiles) {
      if (fs.existsSync(path.join(repoPath, df))) {
        signals.push(`Docker: ${df}`);
        return true;
      }
    }
    return false;
  }

  private detectTests(repoPath: string, signals: string[]): boolean {
    const testDirs = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress'];
    for (const td of testDirs) {
      const fullPath = path.join(repoPath, td);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        signals.push(`Tests: ${td}/`);
        return true;
      }
    }

    // Check for test config files
    const testConfigs = ['jest.config.js', 'jest.config.ts', 'vitest.config.ts', 'pytest.ini', '.pytest.ini'];
    for (const tc of testConfigs) {
      if (fs.existsSync(path.join(repoPath, tc))) {
        signals.push(`Tests: ${tc}`);
        return true;
      }
    }
    return false;
  }

  private detectBuildTools(repoPath: string, buildTools: string[], signals: string[]): void {
    const toolMap: Record<string, string> = {
      'webpack.config.js': 'Webpack',
      'vite.config.ts': 'Vite', 'vite.config.js': 'Vite',
      'rollup.config.js': 'Rollup',
      'turbo.json': 'Turborepo',
      'nx.json': 'Nx',
      'lerna.json': 'Lerna',
      'Makefile': 'Make',
      'Cargo.toml': 'Cargo (Rust)',
      'go.mod': 'Go modules',
      'pom.xml': 'Maven',
      'build.gradle': 'Gradle',
      'CMakeLists.txt': 'CMake',
    };

    for (const [file, tool] of Object.entries(toolMap)) {
      if (fs.existsSync(path.join(repoPath, file))) {
        buildTools.push(tool);
        signals.push(`Build: ${tool}`);
      }
    }
  }

  private detectArchitecture(
    repoPath: string,
    frameworks: Set<string>,
    signals: string[]
  ): ArchitectureAnalysis['architecturePattern'] {
    // Check for monorepo indicators
    const monoIndicators = ['packages/', 'apps/', 'libs/', 'turbo.json', 'nx.json', 'lerna.json', 'pnpm-workspace.yaml'];
    for (const ind of monoIndicators) {
      if (fs.existsSync(path.join(repoPath, ind))) {
        signals.push(`Architecture: monorepo (${ind})`);
        return 'monorepo';
      }
    }

    // Check for microservices
    const servicesDirs = ['services', 'microservices'];
    for (const sd of servicesDirs) {
      const sdPath = path.join(repoPath, sd);
      if (fs.existsSync(sdPath) && fs.statSync(sdPath).isDirectory()) {
        const subs = fs.readdirSync(sdPath).filter(s =>
          fs.statSync(path.join(sdPath, s)).isDirectory()
        );
        if (subs.length >= 2) {
          signals.push(`Architecture: microservices (${subs.length} services)`);
          return 'microservices';
        }
      }
    }

    // Check for serverless
    if (fs.existsSync(path.join(repoPath, 'serverless.yml')) ||
        fs.existsSync(path.join(repoPath, 'serverless.ts')) ||
        fs.existsSync(path.join(repoPath, 'template.yaml')) || // SAM
        frameworks.has('Serverless Framework')) {
      signals.push('Architecture: serverless');
      return 'serverless';
    }

    // Check for CLI tool
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.bin) {
          signals.push('Architecture: CLI tool');
          return 'cli';
        }
      } catch { /* ignore */ }
    }

    // Check for library
    if (fs.existsSync(path.join(repoPath, 'src/index.ts')) ||
        fs.existsSync(path.join(repoPath, 'src/lib')) ||
        fs.existsSync(path.join(repoPath, 'lib/'))) {
      // If no server/API files, likely a library
      const hasServer = fs.existsSync(path.join(repoPath, 'src/server.ts')) ||
                       fs.existsSync(path.join(repoPath, 'src/app.ts')) ||
                       fs.existsSync(path.join(repoPath, 'src/main.ts'));
      if (!hasServer) {
        signals.push('Architecture: library');
        return 'library';
      }
    }

    signals.push('Architecture: monolith (default)');
    return 'monolith';
  }
}
TYPESCRIPT

# ── 7. CompetitiveReport.ts ──
echo "📄 Writing CompetitiveReport.ts..."
cat > src/analyzers/CompetitiveReport.ts << 'TYPESCRIPT'
import OpenAI from 'openai';
import { CodeAnalysis } from './CodeAnalyzer.js';
import { ArchitectureAnalysis } from './ArchitectureExtractor.js';

export interface CompetitiveReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  threatToForge: string;
  recommendation: string;
}

export class CompetitiveReportGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate AI-powered competitive analysis
   */
  async generate(
    title: string,
    description: string,
    codeAnalysis: CodeAnalysis,
    archAnalysis: ArchitectureAnalysis,
    readmeContent?: string
  ): Promise<CompetitiveReport> {
    const prompt = this.buildPrompt(title, description, codeAnalysis, archAnalysis, readmeContent);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a competitive intelligence analyst for FORGE, an autonomous software development platform.
FORGE has 24 specialized AI agents that autonomously generate production-ready code across the full SDLC.
FORGE's key differentiators: 11 governance heuristics, legacy migration (10 languages), $0.02/project cost.
Analyze the competitor and assess their threat to FORGE's market position.
Respond in JSON format with: summary, strengths (array), weaknesses (array), threatToForge, recommendation.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || 'Analysis unavailable',
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        threatToForge: parsed.threatToForge || 'Unknown',
        recommendation: parsed.recommendation || 'Monitor',
      };

    } catch (error: any) {
      console.log(`  ⚠️  AI analysis failed: ${error.message}`);
      return {
        summary: `Code analysis of ${title}: ${codeAnalysis.totalLOC} LOC across ${Object.keys(codeAnalysis.languages).length} languages. ${archAnalysis.architecturePattern} architecture.`,
        strengths: archAnalysis.frameworks.map(f => `Uses ${f}`),
        weaknesses: [],
        threatToForge: 'Unable to assess — AI analysis failed',
        recommendation: 'Manual review required',
      };
    }
  }

  private buildPrompt(
    title: string,
    description: string,
    code: CodeAnalysis,
    arch: ArchitectureAnalysis,
    readme?: string
  ): string {
    // Sort languages by LOC
    const langBreakdown = Object.entries(code.languages)
      .sort(([, a], [, b]) => b - a)
      .map(([lang, loc]) => `  ${lang}: ${loc.toLocaleString()} lines`)
      .join('\n');

    return `
## Competitor: ${title}
${description ? `Description: ${description}` : ''}

## Code Analysis
Total Lines of Code: ${code.totalLOC.toLocaleString()}
Files: ${code.fileCount}
Languages:
${langBreakdown}

## Architecture
Pattern: ${arch.architecturePattern}
Frameworks: ${arch.frameworks.join(', ') || 'None detected'}
CI/CD: ${arch.hasCICD ? 'Yes' : 'No'}
Tests: ${arch.hasTests ? 'Yes' : 'No'}
Docker: ${arch.hasDocker ? 'Yes' : 'No'}
AI/LLM Dependencies: ${arch.hasAIDeps ? 'Yes' : 'No'}
Total Dependencies: ${arch.dependencyCount}
Build Tools: ${arch.buildTools.join(', ') || 'None detected'}

## Key Signals
${arch.signals.map(s => `- ${s}`).join('\n')}

${readme ? `## README (first 2000 chars)\n${readme.substring(0, 2000)}` : ''}

Analyze this competitor's threat to FORGE and provide your assessment as JSON.
`.trim();
  }
}
TYPESCRIPT

# ── 8. DeepAnalysisPipeline.ts (main orchestrator) ──
echo "📄 Writing DeepAnalysisPipeline.ts..."
cat > src/analyzers/DeepAnalysisPipeline.ts << 'TYPESCRIPT'
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
        const aiSummary = `${report.summary}\n\nStrengths: ${report.strengths.join('; ')}\n\nWeaknesses: ${report.weaknesses.join('; ')}\n\nThreat to FORGE: ${report.threatToForge}\n\nRecommendation: ${report.recommendation}`;

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
TYPESCRIPT

# ── 9. Index file for analyzers ──
echo "📄 Writing index.ts..."
cat > src/analyzers/index.ts << 'TYPESCRIPT'
export { RepoCloner } from './RepoCloner.js';
export { CodeAnalyzer } from './CodeAnalyzer.js';
export { ArchitectureExtractor } from './ArchitectureExtractor.js';
export { CompetitiveReportGenerator } from './CompetitiveReport.js';
export { DeepAnalysisPipeline } from './DeepAnalysisPipeline.js';
TYPESCRIPT

# ── 10. CLI script for manual deep analysis ──
echo "📄 Writing run-deep-analysis.ts..."
cat > src/scripts/run-deep-analysis.ts << 'TYPESCRIPT'
import dotenv from 'dotenv';
dotenv.config();

import { DeepAnalysisPipeline } from '../analyzers/DeepAnalysisPipeline.js';
import { closePool } from '../database/pool.js';

async function main() {
  const pipeline = new DeepAnalysisPipeline();
  const args = process.argv.slice(2);

  if (args[0] === '--id') {
    // Analyze specific discovery
    const id = parseInt(args[1]);
    if (isNaN(id)) {
      console.error('Usage: --id <discovery_id>');
      process.exit(1);
    }
    const result = await pipeline.analyze(id);
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Analyze all unprocessed
    const limit = parseInt(args[0]) || 10;
    const results = await pipeline.analyzeUnprocessed(limit);
    console.log(`\nResults: ${results.filter(r => r.success).length} success, ${results.filter(r => !r.success).length} failed`);
  }

  await closePool();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
TYPESCRIPT

# ── 11. Add npm scripts ──
echo "📦 Adding npm scripts..."
cd "$RDA_DIR"
# Check if scripts already exist
if ! grep -q "deep-analysis" package.json 2>/dev/null; then
  # Add scripts using node
  node -e "
    const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
    pkg.scripts = pkg.scripts || {};
    pkg.scripts['deep-analysis'] = 'tsx src/scripts/run-deep-analysis.ts';
    pkg.scripts['deep-analysis:id'] = 'tsx src/scripts/run-deep-analysis.ts --id';
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    console.log('✅ npm scripts added');
  "
fi

# ── 12. Build to verify TypeScript compiles ──
echo ""
echo "🔨 Building TypeScript..."
npm run build 2>&1 | tail -5

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ Step 5: Deep Analysis Implementation Complete"
echo "═══════════════════════════════════════════════"
echo ""
echo "Files created:"
echo "  src/analyzers/RepoCloner.ts"
echo "  src/analyzers/CodeAnalyzer.ts"
echo "  src/analyzers/ArchitectureExtractor.ts"
echo "  src/analyzers/CompetitiveReport.ts"
echo "  src/analyzers/DeepAnalysisPipeline.ts"
echo "  src/analyzers/index.ts"
echo "  src/scripts/run-deep-analysis.ts"
echo ""
echo "Database: deep_analyses table + competitive_intel view"
echo ""
echo "Usage:"
echo "  npm run deep-analysis          # Analyze top 10 unprocessed"
echo "  npm run deep-analysis 20       # Analyze top 20"
echo "  npm run deep-analysis:id -- 42 # Analyze specific discovery"
echo ""
