/**
 * RDA Production Scheduler
 * 
 * The main entrypoint for RDA in production (systemd service).
 * Runs all 4 scanners on cron schedules, assesses discoveries via AI,
 * stores in PostgreSQL, triggers alerts, and triggers FORGE for
 * HIGH+ threats.
 * 
 * FLOW per discovery:
 *   Scanner → RDACore.assessIntelligence() → RDACore.storeDiscovery()
 *   → AlertOrchestrator (Slack) → AutonomousResponseOrchestrator (FORGE)
 */
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { GitHubScanner } from '../scanners/GitHubScanner.js';
import { HackerNewsScanner } from '../scanners/HackerNewsScanner.js';
import { RedditScanner } from '../scanners/RedditScanner.js';
import { ArxivScanner } from '../scanners/ArxivScanner.js';
import { RDACore } from '../core/RDACore.js';
import { AlertOrchestrator } from '../notifiers/AlertOrchestrator.js';
import { AutonomousResponseOrchestrator } from '../integrations/AutonomousResponseOrchestrator.js';
import { getPool, closePool } from '../database/pool.js';
import { Discovery, IntelligenceLevel } from '../types/index.js';

const TIMEZONE = 'America/Los_Angeles';

class ProductionScheduler {
  private github: GitHubScanner;
  private hn: HackerNewsScanner;
  private reddit: RedditScanner;
  private arxiv: ArxivScanner;
  private core: RDACore;
  private alerts: AlertOrchestrator;
  private autonomousResponse: AutonomousResponseOrchestrator;

  // Stats for current session
  private stats = {
    totalDiscoveries: 0,
    critical: 0,
    high: 0,
    forgeTriggered: 0,
    errors: 0,
  };

  constructor() {
    this.github = new GitHubScanner();
    this.hn = new HackerNewsScanner();
    this.reddit = new RedditScanner();
    this.arxiv = new ArxivScanner();
    this.core = new RDACore();
    this.alerts = new AlertOrchestrator();
    this.autonomousResponse = new AutonomousResponseOrchestrator();
  }

  async start() {
    console.log('\n🚀 STARTING RDA AUTONOMOUS INTELLIGENCE SYSTEM');
    console.log('═'.repeat(70));
    console.log('📅 Scan Schedule:');
    console.log('   • GitHub:      Every 15 minutes');
    console.log('   • Hacker News: Every hour');
    console.log('   • Reddit:      Every 6 hours');
    console.log('   • ArXiv:       Daily at midnight PT');
    console.log('');
    console.log('🔔 Alert Schedule:');
    console.log('   • Daily Digest:  8:00 AM PT');
    console.log('   • Weekly Report: Monday 9:00 AM PT');
    console.log('   • Critical:      Immediate');
    console.log('');
    console.log('🤖 FORGE Integration:');
    console.log(`   • Threshold: ${process.env.FORGE_TRIGGER_THRESHOLD || '7.5'}`);
    console.log(`   • Mode: ${process.env.AUTONOMOUS_RESPONSE_ENABLED === 'true' ? '🟢 AUTONOMOUS' : '🟡 MANUAL'}`);
    console.log(`   • API: ${process.env.FORGE_API_URL || 'http://localhost:3001'}`);
    console.log('═'.repeat(70));
    console.log('');

    // Verify database connection
    try {
      const pool = getPool();
      const res = await pool.query('SELECT COUNT(*) FROM discoveries');
      console.log(`🗄️  Database connected — ${res.rows[0].count} existing discoveries`);
    } catch (err: any) {
      console.error('💀 Database connection failed:', err.message);
      process.exit(1);
    }

    // Run initial scans
    console.log('\n🔍 Running initial intelligence scan...\n');
    await this.runAllScans();

    // ── Scan schedules ──────────────────────────────────────────────
    cron.schedule('*/15 * * * *', () => this.safeScan('GitHub', () => this.scanGitHub()), { timezone: TIMEZONE });
    cron.schedule('0 * * * *', () => this.safeScan('Hacker News', () => this.scanHackerNews()), { timezone: TIMEZONE });
    cron.schedule('0 */6 * * *', () => this.safeScan('Reddit', () => this.scanReddit()), { timezone: TIMEZONE });
    cron.schedule('0 0 * * *', () => this.safeScan('ArXiv', () => this.scanArxiv()), { timezone: TIMEZONE });

    // ── Alert schedules ─────────────────────────────────────────────
    cron.schedule('0 8 * * *', async () => {
      console.log('\n[SCHEDULED] Sending daily digest...');
      await this.alerts.sendDailyDigest().catch(e => console.error('Daily digest failed:', e.message));
    }, { timezone: TIMEZONE });

    cron.schedule('0 9 * * 1', async () => {
      console.log('\n[SCHEDULED] Sending weekly report...');
      await this.alerts.sendWeeklyReport().catch(e => console.error('Weekly report failed:', e.message));
    }, { timezone: TIMEZONE });

    console.log('\n✅ RDA is now running autonomously!');
    console.log('💡 Intelligence gathered 24/7 | Reports sent automatically');
    console.log('🚨 HIGH+ threats trigger FORGE counter-features\n');
  }

  // ─── Scan Wrappers ────────────────────────────────────────────────

  private async safeScan(name: string, fn: () => Promise<void>) {
    console.log(`\n[SCHEDULED] ${name} scan starting...`);
    try {
      await fn();
    } catch (err: any) {
      console.error(`❌ ${name} scan crashed: ${err.message}`);
      this.stats.errors++;
    }
  }

  private async runAllScans() {
    await this.scanGitHub();
    await this.sleep(3000);
    await this.scanHackerNews();
    await this.sleep(3000);
    await this.scanReddit();
  }

  private async scanGitHub() {
    try {
      const trending = await this.github.scanTrending({
        languages: ['typescript', 'javascript', 'python'],
        since: 'daily',
      });
      console.log(`   📊 GitHub: ${trending.length} repos found`);

      for (const discovery of trending) {
        await this.processDiscovery(discovery, 'github');
      }
    } catch (err: any) {
      console.error('   ❌ GitHub scan failed:', err.message);
    }
  }

  private async scanHackerNews() {
    try {
      const frontPage = await this.hn.scanFrontPage({ minScore: 50 });
      const showHN = await this.hn.scanShowHN(30);
      const all = [...frontPage, ...showHN];
      console.log(`   📊 HN: ${all.length} stories found`);

      for (const discovery of all) {
        await this.processDiscovery(discovery, 'hackernews');
      }
    } catch (err: any) {
      console.error('   ❌ HN scan failed:', err.message);
    }
  }

  private async scanReddit() {
    try {
      const posts = await this.reddit.scanSubreddits({
        subreddits: ['programming', 'machinelearning'],
        minScore: 100,
      });
      console.log(`   📊 Reddit: ${posts.length} posts found`);

      for (const discovery of posts) {
        await this.processDiscovery(discovery, 'reddit');
      }
    } catch (err: any) {
      console.error('   ❌ Reddit scan failed:', err.message);
    }
  }

  private async scanArxiv() {
    try {
      const papers = await this.arxiv.scanCategories({
        categories: ['cs.AI', 'cs.LG', 'cs.SE'],
        maxResults: 20,
      });
      console.log(`   📊 ArXiv: ${papers.length} papers found`);

      for (const discovery of papers) {
        await this.processDiscovery(discovery, 'arxiv');
      }
    } catch (err: any) {
      console.error('   ❌ ArXiv scan failed:', err.message);
    }
  }

  // ─── Core Pipeline ────────────────────────────────────────────────

  /**
   * The full intelligence pipeline for a single discovery:
   *   1. AI assessment (threat score, level, recommendation)
   *   2. Store in database (with assessment)
   *   3. Alert if warranted
   *   4. Trigger FORGE if HIGH+ threat
   */
  private async processDiscovery(discovery: Discovery, source: string): Promise<void> {
    try {
      // 1. AI assessment
      const assessment: IntelligenceLevel = await this.core.assessIntelligence(discovery);

      // 2. Store in database (assessIntelligence + storeDiscovery merge the data)
      const discoveryId = await this.core.storeDiscovery(discovery, assessment);

      // Track stats
      this.stats.totalDiscoveries++;
      if (assessment.level === 'CRITICAL') this.stats.critical++;
      if (assessment.level === 'HIGH') this.stats.high++;

      // 3. Build the assessed discovery object for downstream processing
      const assessedDiscovery: Discovery = {
        ...discovery,
        id: discoveryId,
        intelligence_level: assessment.level,
        threat_score: assessment.threatScore,
        opportunity_score: assessment.opportunityScore,
        recommended_action: assessment.recommendedAction,
        summary: assessment.reasoning,
      };

      // 4. Trigger FORGE for HIGH+ threats
      //    This is the key integration point — discovery is now assessed and stored
      if (assessment.level === 'CRITICAL' || assessment.level === 'HIGH') {
        try {
          await this.autonomousResponse.processDiscovery(assessedDiscovery);
          this.stats.forgeTriggered++;
        } catch (err: any) {
          // Don't let FORGE failure stop the scanner
          console.error(`   ⚠️  Autonomous response error: ${err.message}`);
        }
      }

      // Rate limit: 2s between AI calls
      await this.sleep(2000);

    } catch (err: any) {
      console.error(`   ❌ Pipeline error for "${discovery.title}": ${err.message}`);
      this.stats.errors++;
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  async shutdown() {
    console.log('\n🛑 Shutting down RDA...');
    console.log(`   Session stats: ${this.stats.totalDiscoveries} discoveries, ${this.stats.critical} critical, ${this.stats.high} high, ${this.stats.forgeTriggered} FORGE triggers, ${this.stats.errors} errors`);
    await closePool();
    console.log('✅ RDA stopped');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const scheduler = new ProductionScheduler();

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
  console.error('💀 Fatal error:', err);
  process.exit(1);
});
