import { closePool } from '../database/pool.js';
import cron from 'node-cron';
import { AlertOrchestrator } from '../notifiers/AlertOrchestrator.js';

export class AlertScheduler {
  private alerts: AlertOrchestrator;

  constructor() {
    this.alerts = new AlertOrchestrator();
    console.log('⏰ Alert Scheduler initialized');
  }

  /**
   * Start scheduled alerts
   */
  start(): void {
    console.log('🚀 Starting Alert Scheduler...\n');
    console.log('📅 Schedule:');
    console.log('   Daily Digest: 6:00 AM EST (every day)');
    console.log('   Weekly Report: Monday 9:00 AM EST');
    console.log('');

    // Daily digest at 6am EST (11am UTC)
    cron.schedule('0 11 * * *', async () => {
      console.log('\n📊 [SCHEDULED] Daily digest sending...');
      await this.alerts.sendDailyDigest();
    });

    // Weekly report on Monday at 9am EST (2pm UTC)
    cron.schedule('0 14 * * 1', async () => {
      console.log('\n📈 [SCHEDULED] Weekly report sending...');
      await this.alerts.sendWeeklyReport();
    });

    console.log('✅ Alert Scheduler running!\n');
  }

  async close(): Promise<void> {
    await closePool();
  }
}
