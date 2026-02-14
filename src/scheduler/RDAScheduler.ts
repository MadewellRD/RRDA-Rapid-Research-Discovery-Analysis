import { getPool, closePool } from '../database/pool.js';
import cron from 'node-cron';
import { RDACore } from '../core/RDACore.js';
import { GitHubScanner } from '../scanners/GitHubScanner.js';
import { HackerNewsScanner } from '../scanners/HackerNewsScanner.js';
import { RedditScanner } from '../scanners/RedditScanner.js';
import { ArxivScanner } from '../scanners/ArxivScanner.js';

interface ScheduleConfig {
  github: string;
  hackerNews: string;
  reddit: string;
  arxiv: string;
}

export class RDAScheduler {
  private rda: RDACore;

  private githubScanner: GitHubScanner;
  private hnScanner: HackerNewsScanner;
  private redditScanner: RedditScanner;
  private arxivScanner: ArxivScanner;

  private schedules: ScheduleConfig = {
    github: '*/15 * * * *',      // Every 15 minutes
    hackerNews: '0 * * * *',     // Every hour
    reddit: '0 */6 * * *',       // Every 6 hours
    arxiv: '0 0 * * *',          // Daily at midnight
  };

  constructor() {
    this.rda = new RDACore();

    this.githubScanner = new GitHubScanner();
    this.hnScanner = new HackerNewsScanner();
    this.redditScanner = new RedditScanner();
    this.arxivScanner = new ArxivScanner();

    console.log('⏰ RDA Scheduler initialized');
  }

  start(): void {
    console.log('🚀 Starting RDA Autonomous Scheduler...\n');
    console.log('📅 Schedule:');
    console.log(`   GitHub:      ${this.schedules.github} (every 15 min)`);
    console.log(`   Hacker News: ${this.schedules.hackerNews} (hourly)`);
    console.log(`   Reddit:      ${this.schedules.reddit} (every 6 hours)`);
    console.log(`   ArXiv:       ${this.schedules.arxiv} (daily)`);
    console.log('');

    // GitHub - Every 15 minutes
    cron.schedule(this.schedules.github, async () => {
      console.log('\n🐙 [SCHEDULED] GitHub scan starting...');
      await this.scanGitHub();
    });

    // Hacker News - Every hour
    cron.schedule(this.schedules.hackerNews, async () => {
      console.log('\n📰 [SCHEDULED] Hacker News scan starting...');
      await this.scanHackerNews();
    });

    // Reddit - Every 6 hours
    cron.schedule(this.schedules.reddit, async () => {
      console.log('\n🔴 [SCHEDULED] Reddit scan starting...');
      await this.scanReddit();
    });

    // ArXiv - Daily at midnight
    cron.schedule(this.schedules.arxiv, async () => {
      console.log('\n📚 [SCHEDULED] ArXiv scan starting...');
      await this.scanArxiv();
    });

    console.log('✅ Scheduler running! Press Ctrl+C to stop.\n');
    
    // Run initial scans immediately
    this.runInitialScans();
  }

  private async runInitialScans(): Promise<void> {
    console.log('🏃 Running initial scans...\n');
    
    await this.scanGitHub();
    await this.sleep(5000);
    
    await this.scanHackerNews();
    await this.sleep(5000);
    
    await this.scanReddit();
    await this.sleep(5000);
    
    await this.scanArxiv();

    console.log('\n✅ Initial scans complete!\n');
  }

  private async scanGitHub(): Promise<void> {
    try {
      const keywords = [
        'autonomous development',
        'code generation',
        'AI agents',
      ];

      const discoveries = await this.githubScanner.searchByKeywords(keywords, 100);
      console.log(`   📊 Found ${discoveries.length} GitHub repositories`);

      let critical = 0;
      let high = 0;

      for (const discovery of discoveries.slice(0, 10)) {
        try {
          const assessment = await this.rda.assessIntelligence(discovery);
          await this.rda.storeDiscovery(discovery, assessment);

          if (assessment.level === 'CRITICAL') critical++;
          if (assessment.level === 'HIGH') high++;

        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
        }

        await this.sleep(2000);
      }

      console.log(`   ✅ Analyzed 10 repos: ${critical} critical, ${high} high`);
      await this.updateMetrics('github', discoveries.length, critical, high);

    } catch (error: any) {
      console.error('   ❌ GitHub scan failed:', error.message);
    }
  }

  private async scanHackerNews(): Promise<void> {
    try {
      const frontPage = await this.hnScanner.scanFrontPage({ minScore: 50 });
      const showHN = await this.hnScanner.scanShowHN(20);
      
      const discoveries = [...frontPage, ...showHN];
      console.log(`   📊 Found ${discoveries.length} HN stories`);

      let critical = 0;
      let high = 0;

      for (const discovery of discoveries.slice(0, 5)) {
        try {
          const assessment = await this.rda.assessIntelligence(discovery);
          await this.rda.storeDiscovery(discovery, assessment);

          if (assessment.level === 'CRITICAL') critical++;
          if (assessment.level === 'HIGH') high++;

        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
        }

        await this.sleep(2000);
      }

      console.log(`   ✅ Analyzed 5 stories: ${critical} critical, ${high} high`);
      await this.updateMetrics('hackernews', discoveries.length, critical, high);

    } catch (error: any) {
      console.error('   ❌ Hacker News scan failed:', error.message);
    }
  }

  private async scanReddit(): Promise<void> {
    try {
      const discoveries = await this.redditScanner.scanSubreddits({
        subreddits: ['programming', 'machinelearning'],
        minScore: 50,
        timeFilter: 'day',
      });

      console.log(`   📊 Found ${discoveries.length} Reddit posts`);

      let critical = 0;
      let high = 0;

      for (const discovery of discoveries) {
        try {
          const assessment = await this.rda.assessIntelligence(discovery);
          await this.rda.storeDiscovery(discovery, assessment);

          if (assessment.level === 'CRITICAL') critical++;
          if (assessment.level === 'HIGH') high++;

        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
        }

        await this.sleep(2000);
      }

      console.log(`   ✅ Analyzed ${discoveries.length} posts: ${critical} critical, ${high} high`);
      await this.updateMetrics('reddit', discoveries.length, critical, high);

    } catch (error: any) {
      console.error('   ❌ Reddit scan failed:', error.message);
    }
  }

  private async scanArxiv(): Promise<void> {
    try {
      const discoveries = await this.arxivScanner.searchByKeywords([
        'autonomous agents',
        'code generation',
      ], 5);

      console.log(`   📊 Found ${discoveries.length} ArXiv papers`);

      let critical = 0;
      let high = 0;

      for (const discovery of discoveries) {
        try {
          const assessment = await this.rda.assessIntelligence(discovery);
          await this.rda.storeDiscovery(discovery, assessment);

          if (assessment.level === 'CRITICAL') critical++;
          if (assessment.level === 'HIGH') high++;

        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
        }

        await this.sleep(2000);
      }

      console.log(`   ✅ Analyzed ${discoveries.length} papers: ${critical} critical, ${high} high`);
      await this.updateMetrics('arxiv', discoveries.length, critical, high);

    } catch (error: any) {
      console.error('   ❌ ArXiv scan failed:', error.message);
    }
  }

  private async updateMetrics(
    source: string,
    total: number,
    critical: number,
    high: number
  ): Promise<void> {
    try {
      await getPool().query(
        `INSERT INTO metrics (date, discoveries_total, discoveries_critical, discoveries_high)
         VALUES (CURRENT_DATE, $1, $2, $3)
         ON CONFLICT (date)
         DO UPDATE SET
           discoveries_total = metrics.discoveries_total + $1,
           discoveries_critical = metrics.discoveries_critical + $2,
           discoveries_high = metrics.discoveries_high + $3`,
        [total, critical, high]
      );
    } catch (error) {
      console.error('Failed to update metrics:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    await closePool();
  }
}
