import nodemailer from 'nodemailer';
import { Discovery } from '../types/index.js';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  fromName: string;
}

export class EmailNotifier {
  private transporter: any;
  private fromAddress: string;
  private fromName: string;
  private toAddress: string;

  constructor(config?: EmailConfig) {
    const smtpConfig = config || {
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_USER || '',
      fromName: process.env.EMAIL_FROM_NAME || 'RRDA Intelligence',
    };

    this.fromAddress = smtpConfig.from;
    this.fromName = smtpConfig.fromName;
    this.toAddress = process.env.ALERT_EMAIL || 'alerts@example.com';

    if (!smtpConfig.user || !smtpConfig.password) {
      console.warn('⚠️  Email not configured');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: false,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.password,
      },
    });

    console.log('📧 Email Notifier initialized');
  }

  /**
   * Send daily digest email
   */
  async sendDailyDigest(stats: {
    date: Date;
    totalDiscoveries: number;
    critical: number;
    high: number;
    medium: number;
    discoveries: Discovery[];
  }): Promise<void> {
    const html = this.generateDailyDigestHTML(stats);

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromAddress}>`,
      to: this.toAddress,
      subject: `RRDA Daily Digest - ${stats.date.toLocaleDateString()}`,
      html,
    };

    await this.send(mailOptions);
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
    costSavings: number;
  }): Promise<void> {
    const html = this.generateWeeklyReportHTML(report);

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromAddress}>`,
      to: this.toAddress,
      subject: `RRDA Weekly Strategic Report - Week of ${report.weekStart.toLocaleDateString()}`,
      html,
    };

    await this.send(mailOptions);
  }

  /**
   * Send critical alert email
   */
  async sendCriticalAlert(discovery: Discovery, assessment: any): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #FF0000; color: white; padding: 20px; border-radius: 5px; }
    .content { padding: 20px; background: #f9f9f9; margin-top: 20px; border-radius: 5px; }
    .threat-score { font-size: 24px; font-weight: bold; color: #FF0000; }
    .action { background: #FFA500; color: white; padding: 15px; margin-top: 20px; border-radius: 5px; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 CRITICAL COMPETITIVE THREAT</h1>
    </div>
    <div class="content">
      <h2>${discovery.title}</h2>
      <p><strong>Source:</strong> ${discovery.source}</p>
      <p><strong>URL:</strong> <a href="${discovery.url}">${discovery.url}</a></p>
      <p><strong>Stars/Engagement:</strong> ${discovery.stars || discovery.upvotes || 0}</p>
      
      <div style="margin: 20px 0;">
        <p><strong>Threat Score:</strong> <span class="threat-score">${assessment.threatScore}/10</span></p>
        <p><strong>Opportunity Score:</strong> ${assessment.opportunityScore}/10</p>
      </div>
      
      <p><strong>Analysis:</strong></p>
      <p>${assessment.reasoning}</p>
      
      <div class="action">
        <strong>Recommended Action:</strong><br>
        ${assessment.recommendedAction}
      </div>
    </div>
    <p style="text-align: center; color: #999; margin-top: 20px;">
      RRDA Intelligence System
    </p>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromAddress}>`,
      to: this.toAddress,
      subject: `🚨 CRITICAL THREAT: ${discovery.title}`,
      html,
    };

    await this.send(mailOptions);
  }

  /**
   * Generate daily digest HTML
   */
  private generateDailyDigestHTML(stats: any): string {
    const discoveryRows = stats.discoveries.slice(0, 10).map((d: Discovery) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">
          <strong><a href="${d.url}">${d.title}</a></strong><br>
          <small>${d.description?.substring(0, 100) || ''}</small>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.source}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.stars || d.upvotes || 0}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #4A90E2; color: white; padding: 20px; border-radius: 5px; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat { text-align: center; padding: 15px; background: #f0f0f0; border-radius: 5px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #4A90E2; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #f0f0f0; padding: 10px; text-align: left; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 RRDA Daily Intelligence Digest</h1>
      <p>${stats.date.toLocaleDateString()}</p>
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${stats.totalDiscoveries}</div>
        <div>Total Discoveries</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: #FF0000;">${stats.critical}</div>
        <div>Critical</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: #FFA500;">${stats.high}</div>
        <div>High Priority</div>
      </div>
    </div>
    
    <h2>Top Discoveries</h2>
    <table>
      <thead>
        <tr>
          <th>Discovery</th>
          <th>Source</th>
          <th>Engagement</th>
        </tr>
      </thead>
      <tbody>
        ${discoveryRows}
      </tbody>
    </table>
    
    <p style="text-align: center; color: #999; margin-top: 30px;">
      RRDA Intelligence System
    </p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate weekly report HTML
   */
  private generateWeeklyReportHTML(report: any): string {
    const threats = report.topThreats.slice(0, 5).map((d: Discovery, i: number) => `
      <li style="margin: 10px 0;">
        <strong><a href="${d.url}">${d.title}</a></strong><br>
        <small>${d.description?.substring(0, 150) || ''}</small>
      </li>
    `).join('');

    const opportunities = report.topOpportunities.slice(0, 5).map((d: Discovery, i: number) => `
      <li style="margin: 10px 0;">
        <strong><a href="${d.url}">${d.title}</a></strong><br>
        <small>${d.description?.substring(0, 150) || ''}</small>
      </li>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 5px; }
    .section { margin: 30px 0; padding: 20px; background: #f9f9f9; border-radius: 5px; }
    .metric { font-size: 28px; font-weight: bold; color: #667eea; }
    h2 { color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📈 Weekly Strategic Intelligence Report</h1>
      <p>${report.weekStart.toLocaleDateString()} - ${report.weekEnd.toLocaleDateString()}</p>
    </div>
    
    <div class="section">
      <h2>Executive Summary</h2>
      <p><span class="metric">${report.totalDiscoveries}</span> discoveries analyzed this week</p>
      <p><span class="metric" style="color: #FF0000;">${report.critical}</span> critical competitive threats identified</p>
      <p><span class="metric" style="color: #36A64F;">${report.high}</span> high-value opportunities detected</p>
      <p><span class="metric" style="color: #4A90E2;">$${report.costSavings.toLocaleString()}</span> in potential cost savings identified</p>
    </div>
    
    <div class="section">
      <h2>🚨 Top Competitive Threats</h2>
      <ol>${threats || '<li>No critical threats this week</li>'}</ol>
    </div>
    
    <div class="section">
      <h2>💡 Top Opportunities</h2>
      <ol>${opportunities || '<li>No major opportunities identified</li>'}</ol>
    </div>
    
    <div class="section">
      <h2>📈 Market Trends</h2>
      <ul>
        ${report.trends.map((t: string) => `<li>${t}</li>`).join('') || '<li>No significant trends</li>'}
      </ul>
    </div>
    
    <p style="text-align: center; color: #999; margin-top: 40px;">
      <strong>RRDA Intelligence System</strong>
    </p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send email
   */
  private async send(mailOptions: any): Promise<void> {
    if (!this.transporter) {
      console.log('⚠️  Email not configured, skipping');
      return;
    }

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${mailOptions.to}`);
    } catch (error: any) {
      console.error('❌ Failed to send email:', error.message);
      throw error;
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ Email configuration verified');
      return true;
    } catch (error) {
      console.error('❌ Email test failed:', error);
      return false;
    }
  }
}
