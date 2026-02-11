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
