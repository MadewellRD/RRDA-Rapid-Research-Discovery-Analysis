import { SlackNotifier } from './SlackNotifier.js';
import { EmailNotifier } from './EmailNotifier.js';
import { ReportGenerator } from './ReportGenerator.js';
import { Discovery } from '../types/index.js';
import { getPool } from '../database/pool.js';
import { Pool } from 'pg';

export class AlertOrchestrator {
  private slack: SlackNotifier;
  private email: EmailNotifier;
  private reports: ReportGenerator;
  private pool: Pool;

  constructor() {
    this.slack = new SlackNotifier();
    this.email = new EmailNotifier();
    this.reports = new ReportGenerator();
    this.pool = getPool();

    console.log('🔔 Alert Orchestrator initialized');
  }

  /**
   * Process new discovery and send appropriate alerts
   */
  async processDiscovery(discovery: Discovery, assessment: any): Promise<void> {
    // Store alert in database
    await this.logAlert('discovery', discovery.id || null, {
      level: assessment.level,
      threatScore: assessment.threatScore,
    });

    // Send alerts based on intelligence level
    if (assessment.level === 'CRITICAL') {
      await this.sendCriticalAlert(discovery, assessment);
    } else if (assessment.level === 'HIGH') {
      await this.sendHighPriorityAlert(discovery, assessment);
    }
  }

  /**
   * Send critical threat alert (immediate)
   */
  private async sendCriticalAlert(discovery: Discovery, assessment: any): Promise<void> {
    console.log(`🚨 Sending CRITICAL alert for: ${discovery.title}`);

    // Send to Slack immediately
    await this.slack.sendCriticalAlert(discovery);

    // Send email alert
    await this.email.sendCriticalAlert(discovery, assessment);

    console.log('✅ Critical alerts sent');
  }

  /**
   * Send high priority alert
   */
  private async sendHighPriorityAlert(discovery: Discovery, assessment: any): Promise<void> {
    console.log(`⚠️  Sending HIGH priority alert for: ${discovery.title}`);

    // Send to Slack
    await this.slack.sendHighPriorityAlert(discovery, assessment);

    // Email is batched in daily digest
    console.log('✅ High priority alert sent to Slack');
  }

  /**
   * Send daily digest (scheduled for 6am EST)
   */
  async sendDailyDigest(): Promise<void> {
    console.log('📊 Generating daily digest...');

    const stats = await this.reports.generateDailyStats();

    if (stats.totalDiscoveries === 0) {
      console.log('No discoveries today, skipping digest');
      return;
    }

    // Send to Slack
    await this.slack.sendDailyDigest({
      totalDiscoveries: stats.totalDiscoveries,
      critical: stats.critical,
      high: stats.high,
      topDiscoveries: stats.discoveries,
    });

    // Send email
    await this.email.sendDailyDigest(stats);

    await this.logAlert('daily_digest', null, stats);
    console.log('✅ Daily digest sent');
  }

  /**
   * Send weekly report (scheduled for Monday 9am EST)
   */
  async sendWeeklyReport(): Promise<void> {
    console.log('📈 Generating weekly report...');

    const report = await this.reports.generateWeeklyReport();

    // Send to Slack
    await this.slack.sendWeeklyReport(report);

    // Send email
    await this.email.sendWeeklyReport(report);

    await this.logAlert('weekly_report', null, report);
    console.log('✅ Weekly report sent');
  }

  /**
   * Test all notification channels
   */
  async testAllChannels(): Promise<void> {
    console.log('🧪 Testing notification channels...\n');

    // Test Slack
    console.log('Testing Slack...');
    const slackOk = await this.slack.testConnection();
    console.log(slackOk ? '✅ Slack working' : '❌ Slack failed');

    // Test Email
    console.log('\nTesting Email...');
    const emailOk = await this.email.testConnection();
    console.log(emailOk ? '✅ Email working' : '❌ Email failed');

    console.log('\n' + '='.repeat(50));
    console.log(slackOk && emailOk ? '✅ All channels operational' : '⚠️  Some channels failed');
  }

  /**
   * Log alert to database
   */
  private async logAlert(type: string, discoveryId: number | null, data: any): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO alerts (alert_type, discovery_id, channel, recipient, content, delivered, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          type,
          discoveryId,
          'slack+email',
          process.env.ALERT_EMAIL || 'rda@madewellrd.com',
          JSON.stringify(data).substring(0, 500),
          true,
          JSON.stringify(data),
        ]
      );
    } catch (error) {
      console.error('Failed to log alert:', error);
    }
  }

  // No more close() — pool lifecycle owned by database/pool.ts
}
