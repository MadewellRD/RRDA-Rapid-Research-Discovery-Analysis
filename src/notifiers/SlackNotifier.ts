import { Discovery } from '../types/index.js';

export interface SlackAlert {
  type: 'critical' | 'high' | 'daily_digest' | 'weekly_report';
  title: string;
  message: string;
  discoveries?: Discovery[];
  color?: string;
}

export class SlackNotifier {
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || '';

    if (!this.webhookUrl) {
      console.warn('⚠️  Slack webhook URL not configured');
    } else {
      console.log('📱 Slack Notifier initialized');
    }
  }

  /**
   * Send critical threat alert
   */
  async sendCriticalAlert(discovery: Discovery): Promise<void> {
    const message = {
      text: `🚨 *CRITICAL COMPETITIVE THREAT DETECTED*`,
      attachments: [
        {
          color: '#FF0000',
          title: discovery.title,
          title_link: discovery.url,
          fields: [
            {
              title: 'Source',
              value: discovery.source,
              short: true,
            },
            {
              title: 'Stars/Upvotes',
              value: `${discovery.stars || discovery.upvotes || 0}`,
              short: true,
            },
            {
              title: 'Description',
              value: discovery.description?.substring(0, 200) || 'No description',
              short: false,
            },
          ],
          footer: 'RRDA Intelligence',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * Send high priority alert
   */
  async sendHighPriorityAlert(discovery: Discovery, assessment: any): Promise<void> {
    const message = {
      text: `⚠️  *High Priority Discovery*`,
      attachments: [
        {
          color: '#FFA500',
          title: discovery.title,
          title_link: discovery.url,
          fields: [
            {
              title: 'Threat Score',
              value: `${assessment.threatScore}/10`,
              short: true,
            },
            {
              title: 'Opportunity Score',
              value: `${assessment.opportunityScore}/10`,
              short: true,
            },
            {
              title: 'Recommended Action',
              value: assessment.recommendedAction,
              short: false,
            },
          ],
          footer: 'RRDA Intelligence',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * Send daily digest
   */
  async sendDailyDigest(stats: {
    totalDiscoveries: number;
    critical: number;
    high: number;
    topDiscoveries: Discovery[];
  }): Promise<void> {
    const discoveries = stats.topDiscoveries.slice(0, 5).map((d, i) => {
      return `${i + 1}. *${d.title}* (${d.stars || d.upvotes || 0} ⭐)\n   ${d.url}`;
    }).join('\n\n');

    const message = {
      text: `📊 *RRDA Daily Intelligence Digest*`,
      attachments: [
        {
          color: '#36A64F',
          fields: [
            {
              title: 'Total Discoveries',
              value: `${stats.totalDiscoveries}`,
              short: true,
            },
            {
              title: 'Critical Threats',
              value: `${stats.critical}`,
              short: true,
            },
            {
              title: 'High Priority',
              value: `${stats.high}`,
              short: true,
            },
          ],
          text: `*Top 5 Discoveries:*\n\n${discoveries}`,
          footer: 'RRDA Daily Report',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * Send weekly report
   */
  async sendWeeklyReport(report: {
    weekStart: Date;
    weekEnd: Date;
    totalDiscoveries: number;
    critical: number;
    high: number;
    topThreats: Discovery[];
    topOpportunities: Discovery[];
    trends: string[];
  }): Promise<void> {
    const threats = report.topThreats.slice(0, 3).map((d, i) => {
      return `${i + 1}. ${d.title}`;
    }).join('\n');

    const opportunities = report.topOpportunities.slice(0, 3).map((d, i) => {
      return `${i + 1}. ${d.title}`;
    }).join('\n');

    const message = {
      text: `📈 *Weekly Strategic Intelligence Report*`,
      attachments: [
        {
          color: '#4A90E2',
          title: `Week of ${report.weekStart.toLocaleDateString()}`,
          fields: [
            {
              title: '📊 Overview',
              value: `Total: ${report.totalDiscoveries} | Critical: ${report.critical} | High: ${report.high}`,
              short: false,
            },
            {
              title: '🚨 Top Competitive Threats',
              value: threats || 'None',
              short: false,
            },
            {
              title: '💡 Top Opportunities',
              value: opportunities || 'None',
              short: false,
            },
            {
              title: '📈 Market Trends',
              value: report.trends.join('\n') || 'No significant trends',
              short: false,
            },
          ],
          footer: 'RRDA Weekly Report',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * Send custom alert
   */
  async sendCustomAlert(alert: SlackAlert): Promise<void> {
    const colorMap = {
      critical: '#FF0000',
      high: '#FFA500',
      daily_digest: '#36A64F',
      weekly_report: '#4A90E2',
    };

    const message = {
      text: alert.title,
      attachments: [
        {
          color: alert.color || colorMap[alert.type],
          text: alert.message,
          footer: 'RRDA Intelligence',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.send(message);
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const message = {
        text: '✅ RRDA Alert System Test',
        attachments: [
          {
            color: '#36A64F',
            text: 'Slack notifications are working correctly!',
            footer: 'RRDA Test',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      await this.send(message);
      return true;
    } catch (error) {
      console.error('❌ Slack test failed:', error);
      return false;
    }
  }

  /**
   * Send message to Slack
   */
  private async send(message: any): Promise<void> {
    if (!this.webhookUrl) {
      console.log('⚠️  Slack not configured, skipping notification');
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }

      console.log('✅ Slack notification sent');
    } catch (error: any) {
      console.error('❌ Failed to send Slack notification:', error.message);
      throw error;
    }
  }
}
