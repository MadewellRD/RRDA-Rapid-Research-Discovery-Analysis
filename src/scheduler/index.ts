/**
 * Innovation Scheduler
 * 
 * Runs the continuous intelligence and proposal-generation loop.
 * 
 * ARCHITECTURE:
 *   RDA Scanners (4 sources, continuous)
 *     → discoveries table
 *   Innovation Agent (every 20 min)
 *     → synthesizes trends → proposes novel projects
 *
 * This checkout currently includes the original 4 source scanners:
 *   - GitHub
 *   - Hacker News
 *   - Reddit
 *   - ArXiv
 */
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

// Existing scanners
import { GitHubScanner } from '../scanners/GitHubScanner.js';
import { HackerNewsScanner } from '../scanners/HackerNewsScanner.js';
import { RedditScanner } from '../scanners/RedditScanner.js';
import { ArxivScanner } from '../scanners/ArxivScanner.js';

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
    errors: 0,
  };

  constructor() {
    // Existing
    this.github = new GitHubScanner();
    this.hn = new HackerNewsScanner();
    this.reddit = new RedditScanner();
    this.arxiv = new ArxivScanner();

    // Core
    this.core = new RDACore();
    this.innovation = new InnovationAgent();
    this.alerts = new AlertOrchestrator();
  }

  async start() {
    console.log('\n' + '='.repeat(70));
    console.log('  RRDA — Rapid Research Development Analysis');
    console.log('  Continuous intelligence and proposal generation');
    console.log('='.repeat(70));
    console.log('');
    console.log('INTELLIGENCE SOURCES (4):');
    console.log('   1. GitHub Trending       every 15 min');
    console.log('   2. Hacker News           every hour');
    console.log('   3. Reddit                every 6 hours');
    console.log('   4. ArXiv                 daily midnight PT');
    console.log('');
    console.log('INNOVATION AGENT:');
    console.log('   Cycle: every 20 minutes');
    console.log('   Mode: autonomous proposal synthesis');
    console.log(`   Creative model: ${process.env.INNOVATION_CREATIVE_MODEL || 'gpt-4o'}`);
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
          created_at TIMESTAMP DEFAULT NOW()
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

    console.log('\nRRDA scheduler is live');
    console.log('4 intelligence sources | Innovation Agent every 20 min\n');
  }

  // ─── Innovation Cycle ─────────────────────────────────────────

  private async runInnovationCycle() {
    this.stats.innovationCycles++;
    try {
      const proposal = await this.innovation.run();
      if (proposal) {
        this.stats.projectsProposed++;
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
    await Promise.allSettled([
      this.safeScan('GitHub', () => this.scanGitHub()),
      this.safeScan('Hacker News', () => this.scanHackerNews()),
      this.safeScan('Reddit', () => this.scanReddit()),
      this.safeScan('ArXiv', () => this.scanArxiv()),
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

  // ─── Lifecycle ────────────────────────────────────────────────

  async shutdown() {
    console.log('\nShutting down RRDA scheduler...');
    console.log(`   Stats: ${this.stats.totalDiscoveries} discoveries, ${this.stats.innovationCycles} cycles, ${this.stats.projectsProposed} proposals, ${this.stats.errors} errors`);
    // Stop all cron schedules
    for (const task of this.cronTasks) {
      task.stop();
    }
    this.cronTasks = [];
    await closePool();
    console.log('Shutdown complete');
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
