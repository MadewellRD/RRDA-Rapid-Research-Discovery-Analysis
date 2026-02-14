/**
 * Innovation Scheduler
 * 
 * Replaces the old "counter-feature" approach with a creative innovation loop.
 * 
 * ARCHITECTURE:
 *   RDA Scanners (12 sources, continuous) 
 *     → discoveries table
 *   Innovation Agent (every 20 min)
 *     → synthesizes trends → proposes novel projects
 *     → auto-triggers FORGE
 * 
 * NEW SCANNERS (added to existing GitHub, HN, Reddit, ArXiv):
 *   - Product Hunt (every 6h)
 *   - Dev.to (every 2h)  
 *   - npm trending (every 3h)
 *   - PyPI (every 6h)
 *   - Tech News RSS (every 2h)
 *   - Stack Overflow (every 4h)
 *   - Lobsters (every hour)
 *   - GitHub Issues (every 6h)
 * 
 * Total: 12 intelligence sources feeding one Innovation Agent
 */
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

// Existing scanners
import { GitHubScanner } from '../scanners/GitHubScanner.js';
import { HackerNewsScanner } from '../scanners/HackerNewsScanner.js';
import { RedditScanner } from '../scanners/RedditScanner.js';
import { ArxivScanner } from '../scanners/ArxivScanner.js';

// New scanners
import { ProductHuntScanner } from '../scanners/ProductHuntScanner.js';
import { DevToScanner } from '../scanners/DevToScanner.js';
import { NpmTrendingScanner } from '../scanners/NpmTrendingScanner.js';
import { PyPIScanner } from '../scanners/PyPIScanner.js';
import { TechNewsScanner } from '../scanners/TechNewsScanner.js';
import { StackOverflowScanner } from '../scanners/StackOverflowScanner.js';
import { LobstersScanner } from '../scanners/LobstersScanner.js';
import { GitHubIssuesScanner } from '../scanners/GitHubIssuesScanner.js';

// Core
import { RDACore } from '../core/RDACore.js';
import { InnovationAgent } from '../agents/InnovationAgent.js';
import { AlertOrchestrator } from '../notifiers/AlertOrchestrator.js';
import { getPool, closePool } from '../database/pool.js';
import { Discovery } from '../types/index.js';

const TIMEZONE = 'America/Los_Angeles';


// ─── Domain Relevance Filter ────────────────────────────────
const DOMAIN_KEYWORDS = [
  // Core
  'ai', 'agent', 'llm', 'automation', 'devtools', 'developer tool',
  'code generation', 'codegen', 'software development', 'sdlc', 'ci/cd',
  'autonomous', 'orchestration', 'pipeline', 'workflow',
  // Adjacent
  'api', 'saas', 'platform', 'infrastructure', 'testing', 'test framework',
  'deployment', 'monitoring', 'observability', 'debugging', 'profiling',
  'microservice', 'serverless', 'low-code', 'no-code', 'scaffold',
  // AI/ML
  'machine learning', 'deep learning', 'transformer', 'neural',
  'fine-tuning', 'fine tuning', 'prompt engineering', 'rag', 'embedding',
  'multi-agent', 'multiagent', 'mcp', 'model context protocol',
  'openai', 'anthropic', 'claude', 'gpt', 'langchain', 'llamaindex',
  // Enterprise
  'governance', 'compliance', 'security', 'audit', 'vulnerability',
  'quality assurance', 'code review', 'static analysis', 'linting',
  // Dev ecosystem
  'typescript', 'javascript', 'python', 'rust', 'golang', 'node',
  'react', 'nextjs', 'express', 'fastapi', 'django',
  'docker', 'kubernetes', 'terraform', 'github action',
  'database', 'postgres', 'redis', 'graphql', 'rest api', 'grpc',
  'open source', 'cli', 'sdk', 'framework', 'library',
];

function isRelevant(discovery: { title: string; description?: string; metadata?: any }): boolean {
  const text = [
    discovery.title || '',
    discovery.description || '',
    ...(discovery.metadata?.tags || []),
    ...(discovery.metadata?.keywords || []),
  ].join(' ').toLowerCase();

  return DOMAIN_KEYWORDS.some(kw => text.includes(kw));
}

class InnovationScheduler {
  // Existing scanners
  private github: GitHubScanner;
  private hn: HackerNewsScanner;
  private reddit: RedditScanner;
  private arxiv: ArxivScanner;

  // New scanners
  private productHunt: ProductHuntScanner;
  private devTo: DevToScanner;
  private npm: NpmTrendingScanner;
  private pypi: PyPIScanner;
  private techNews: TechNewsScanner;
  private stackoverflow: StackOverflowScanner;
  private lobsters: LobstersScanner;
  private githubIssues: GitHubIssuesScanner;

  // Core
  private core: RDACore;
  private innovation: InnovationAgent;
  private alerts: AlertOrchestrator;

  // Scheduling
  private cronTasks: cron.ScheduledTask[] = [];
  private running = new Set<string>();

  private stats = {
    totalDiscoveries: 0,
    innovationCycles: 0,
    projectsProposed: 0,
    forgeTriggered: 0,
    errors: 0,
  };

  constructor() {
    // Existing
    this.github = new GitHubScanner();
    this.hn = new HackerNewsScanner();
    this.reddit = new RedditScanner();
    this.arxiv = new ArxivScanner();

    // New
    this.productHunt = new ProductHuntScanner();
    this.devTo = new DevToScanner();
    this.npm = new NpmTrendingScanner();
    this.pypi = new PyPIScanner();
    this.techNews = new TechNewsScanner();
    this.stackoverflow = new StackOverflowScanner();
    this.lobsters = new LobstersScanner();
    this.githubIssues = new GitHubIssuesScanner();

    // Core
    this.core = new RDACore();
    this.innovation = new InnovationAgent();
    this.alerts = new AlertOrchestrator();
  }

  async start() {
    console.log('\n' + '='.repeat(70));
    console.log('  PROMETHEUS — Autonomous Innovation Engine');
    console.log('  RDA Intelligence + Innovation Agent + FORGE Production');
    console.log('='.repeat(70));
    console.log('');
    console.log('INTELLIGENCE SOURCES (12):');
    console.log('   1. GitHub Trending       every 15 min');
    console.log('   2. Hacker News           every hour');
    console.log('   3. Reddit                every 6 hours');
    console.log('   4. ArXiv                 daily midnight PT');
    console.log('   5. Product Hunt          every 6 hours');
    console.log('   6. Dev.to                every 2 hours');
    console.log('   7. npm Trending          every 3 hours');
    console.log('   8. PyPI                  every 6 hours');
    console.log('   9. Tech News (RSS)       every 2 hours');
    console.log('  10. Stack Overflow        every 4 hours');
    console.log('  11. Lobsters              every hour');
    console.log('  12. GitHub Issues         every 6 hours');
    console.log('');
    console.log('INNOVATION AGENT:');
    console.log('   Cycle: every 20 minutes');
    console.log('   Mode: AUTONOMOUS — auto-triggers FORGE');
    console.log(`   Creative model: ${process.env.INNOVATION_CREATIVE_MODEL || 'gpt-4o'}`);
    console.log(`   FORGE API: ${process.env.FORGE_API_URL || 'http://localhost:3001'}`);
    console.log('='.repeat(70));

    // Verify database
    try {
      const pool = getPool();
      const res = await pool.query('SELECT COUNT(*) FROM discoveries');
      console.log(`\nDatabase: ${res.rows[0].count} existing discoveries`);

      // Create innovation_proposals table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS innovation_proposals (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          concept TEXT NOT NULL,
          problem_statement TEXT,
          inspiration_sources JSONB DEFAULT '[]',
          target_users TEXT,
          capabilities JSONB DEFAULT '[]',
          novelty_score INTEGER DEFAULT 5,
          reasoning TEXT,
          status VARCHAR(20) DEFAULT 'proposed',
          forge_project_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_proposals_status ON innovation_proposals (status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_proposals_created ON innovation_proposals (created_at DESC)`);
      console.log('Innovation proposals table: ready');
    } catch (err: any) {
      console.error('Database connection failed:', err.message);
      process.exit(1);
    }

    // ── Run initial intelligence scan ───────────────────────────
    console.log('\nRunning initial intelligence scan...\n');
    await this.runAllScans();

    // ── Run first innovation cycle ──────────────────────────────
    console.log('\nRunning first innovation cycle...\n');
    await this.runInnovationCycle();

    // ── Scanner schedules ───────────────────────────────────────
    // Original 4
    this.cronTasks.push(cron.schedule('*/15 * * * *', () => this.safeScan('GitHub', () => this.scanGitHub()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 * * * *', () => this.safeScan('Hacker News', () => this.scanHackerNews()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 */6 * * *', () => this.safeScan('Reddit', () => this.scanReddit()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 0 * * *', () => this.safeScan('ArXiv', () => this.scanArxiv()), { timezone: TIMEZONE }));

    // New 8
    this.cronTasks.push(cron.schedule('0 */6 * * *', () => this.safeScan('Product Hunt', () => this.scanProductHunt()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 */2 * * *', () => this.safeScan('Dev.to', () => this.scanDevTo()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 */3 * * *', () => this.safeScan('npm', () => this.scanNpm()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 */6 * * *', () => this.safeScan('PyPI', () => this.scanPyPI()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('30 */2 * * *', () => this.safeScan('Tech News', () => this.scanTechNews()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 */4 * * *', () => this.safeScan('Stack Overflow', () => this.scanStackOverflow()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('30 * * * *', () => this.safeScan('Lobsters', () => this.scanLobsters()), { timezone: TIMEZONE }));
    this.cronTasks.push(cron.schedule('0 */6 * * *', () => this.safeScan('GitHub Issues', () => this.scanGitHubIssues()), { timezone: TIMEZONE }));

    // ── Innovation Agent schedule ───────────────────────────────
    this.cronTasks.push(cron.schedule('*/20 * * * *', () => this.runInnovationCycle(), { timezone: TIMEZONE }));

    // ── Alert schedules ─────────────────────────────────────────
    this.cronTasks.push(cron.schedule('0 8 * * *', async () => {
      console.log('\n[SCHEDULED] Sending daily digest...');
      await this.alerts.sendDailyDigest().catch(e => console.error('Daily digest failed:', e.message));
    }, { timezone: TIMEZONE }));

    this.cronTasks.push(cron.schedule('0 9 * * 1', async () => {
      console.log('\n[SCHEDULED] Sending weekly report...');
      await this.alerts.sendWeeklyReport().catch(e => console.error('Weekly report failed:', e.message));
    }, { timezone: TIMEZONE }));

    console.log('\nPROMETHEUS Innovation Engine is LIVE');
    console.log('12 intelligence sources | Innovation Agent every 20 min | FORGE auto-trigger\n');
  }

  // ─── Innovation Cycle ─────────────────────────────────────────

  private async runInnovationCycle() {
    this.stats.innovationCycles++;
    try {
      const proposal = await this.innovation.run();
      if (proposal) {
        this.stats.projectsProposed++;
        if (proposal.forgeProjectId) this.stats.forgeTriggered++;
      }
    } catch (err: any) {
      console.error(`Innovation cycle failed: ${err.message}`);
      this.stats.errors++;
    }
  }

  // ─── Scan Wrappers ────────────────────────────────────────────

  private async safeScan(name: string, fn: () => Promise<void>) {
    if (this.running.has(name)) {
      console.log(`\n[SCAN] ${name} still running — skipping overlap`);
      return;
    }
    this.running.add(name);
    console.log(`\n[SCAN] ${name} starting...`);
    try {
      await fn();
    } catch (err: any) {
      console.error(`[SCAN] ${name} failed: ${err.message}`);
      this.stats.errors++;
    } finally {
      this.running.delete(name);
    }
  }

  private async processDiscoveries(discoveries: Discovery[], source: string) {
    // Pre-filter: only assess domain-relevant discoveries
    const relevant = discoveries.filter(d => isRelevant(d));
    const filtered = discoveries.length - relevant.length;
    if (filtered > 0) console.log(`   Filtered: ${filtered}/${discoveries.length} off-topic, ${relevant.length} relevant`);

    for (const discovery of relevant) {
      try {
        // Skip discoveries already in DB to save AI assessment costs
        const pool = getPool();
        const existing = await pool.query(
          'SELECT id FROM discoveries WHERE source = $1 AND url = $2 LIMIT 1',
          [source, discovery.url]
        );
        if (existing.rows.length > 0) continue;

        // AI assessment
        const assessment = await this.core.assessIntelligence(discovery);
        
        // Store
        await this.core.storeDiscovery(discovery, assessment);
        this.stats.totalDiscoveries++;

        // Rate limit between AI calls
        await new Promise(r => setTimeout(r, 1500));
      } catch (err: any) {
        console.error(`   Pipeline error "${discovery.title}": ${err.message}`);
      }
    }
  }

  // ─── Scanner Implementations ──────────────────────────────────

  private async runAllScans() {
    // Batch 1: fast/independent sources in parallel
    await Promise.allSettled([
      this.safeScan('GitHub', () => this.scanGitHub()),
      this.safeScan('Hacker News', () => this.scanHackerNews()),
      this.safeScan('Lobsters', () => this.scanLobsters()),
    ]);
    // Batch 2: additional sources
    await Promise.allSettled([
      this.safeScan('Dev.to', () => this.scanDevTo()),
      this.safeScan('Tech News', () => this.scanTechNews()),
    ]);
  }

  private async scanGitHub() {
    const trending = await this.github.scanTrending({
      languages: ['typescript', 'javascript', 'python'],
      since: 'daily',
    });
    console.log(`   GitHub: ${trending.length} repos`);
    await this.processDiscoveries(trending, 'github_trending');
  }

  private async scanHackerNews() {
    const frontPage = await this.hn.scanFrontPage({ minScore: 100 });
    const showHN = await this.hn.scanShowHN(20);
    const all = [...frontPage, ...showHN];
    console.log(`   HN: ${all.length} stories`);
    await this.processDiscoveries(all, 'hackernews');
  }

  private async scanReddit() {
    const posts = await this.reddit.scanSubreddits({
      subreddits: ['programming', 'machinelearning', 'devops', 'webdev', 'LocalLLaMA', 'artificial', 'learnprogramming', 'softwaredevelopment'],
      minScore: 150,
    });
    console.log(`   Reddit: ${posts.length} posts`);
    await this.processDiscoveries(posts, 'reddit');
  }

  private async scanArxiv() {
    const papers = await this.arxiv.scanCategories({
      categories: ['cs.AI', 'cs.LG', 'cs.SE', 'cs.CL'],
      maxResults: 20,
    });
    console.log(`   ArXiv: ${papers.length} papers`);
    await this.processDiscoveries(papers, 'arxiv');
  }

  private async scanProductHunt() {
    const products = await this.productHunt.scanToday(15);
    console.log(`   Product Hunt: ${products.length} products`);
    await this.processDiscoveries(products, 'producthunt');
  }

  private async scanDevTo() {
    const trending = await this.devTo.scanTrending(10);
    const tagged = await this.devTo.scanByTags(['ai', 'llm', 'devtools', 'api', 'automation', 'opensource', 'testing', 'cicd', 'agentai', 'machinelearning'], 5);
    const all = [...trending, ...tagged];
    console.log(`   Dev.to: ${all.length} articles`);
    await this.processDiscoveries(all, 'devto');
  }

  private async scanNpm() {
    const packages = await this.npm.scanTrending(['ai-agent', 'llm', 'mcp', 'code-generation', 'devtools', 'automation', 'testing-framework', 'ci-cd', 'api-gateway', 'orchestration']);
    console.log(`   npm: ${packages.length} packages`);
    await this.processDiscoveries(packages, 'npm_trending');
  }

  private async scanPyPI() {
    const packages = await this.pypi.scanTrending();
    console.log(`   PyPI: ${packages.length} packages`);
    await this.processDiscoveries(packages, 'pypi');
  }

  private async scanTechNews() {
    const articles = await this.techNews.scanAll(20);
    console.log(`   Tech News: ${articles.length} articles`);
    await this.processDiscoveries(articles, 'technews');
  }

  private async scanStackOverflow() {
    const trending = await this.stackoverflow.scanTrending(['openai', 'langchain', 'llm', 'github-actions', 'ci-cd', 'docker', 'kubernetes', 'api-design', 'code-generation', 'automated-testing']);
    const unanswered = await this.stackoverflow.scanUnanswered(['ai-agent', 'llm', 'devops', 'automation', 'code-review']);
    console.log(`   Stack Overflow: ${trending.length + unanswered.length} questions`);
    await this.processDiscoveries([...trending, ...unanswered], 'stackoverflow');
  }

  private async scanLobsters() {
    const hot = await this.lobsters.scanHottest(20);
    console.log(`   Lobsters: ${hot.length} stories`);
    await this.processDiscoveries(hot, 'lobsters');
  }

  private async scanGitHubIssues() {
    const features = await this.githubIssues.scanFeatureRequests(20);
    console.log(`   GitHub Issues: ${features.length} feature requests`);
    await this.processDiscoveries(features, 'github_issues');
  }

  // ─── Lifecycle ────────────────────────────────────────────────

  async shutdown() {
    console.log('\nShutting down PROMETHEUS Innovation Engine...');
    console.log(`   Stats: ${this.stats.totalDiscoveries} discoveries, ${this.stats.innovationCycles} cycles, ${this.stats.projectsProposed} proposals, ${this.stats.forgeTriggered} FORGE triggers, ${this.stats.errors} errors`);
    // Stop all cron schedules
    for (const task of this.cronTasks) {
      task.stop();
    }
    this.cronTasks = [];
    await closePool();
    console.log('Shutdown complete');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const scheduler = new InnovationScheduler();

  process.on('SIGINT', async () => {
    await scheduler.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await scheduler.shutdown();
    process.exit(0);
  });

  await scheduler.start();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
