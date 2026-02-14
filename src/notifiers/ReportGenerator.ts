import { Pool } from 'pg';
import { Discovery } from '../types/index.js';
import { getPool } from '../database/pool.js';

export interface DailyStats {
  date: Date;
  totalDiscoveries: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  discoveries: Discovery[];
}

export interface WeeklyReport {
  weekStart: Date;
  weekEnd: Date;
  totalDiscoveries: number;
  critical: number;
  high: number;
  topThreats: Discovery[];
  topOpportunities: Discovery[];
  trends: string[];
  costSavings: number;
}

export class ReportGenerator {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
    console.log('📊 Report Generator initialized');
  }

  /**
   * Generate daily statistics
   */
  async generateDailyStats(date?: Date): Promise<DailyStats> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const totalResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM discoveries
       WHERE discovered_at >= $1 AND discovered_at <= $2`,
      [startOfDay, endOfDay]
    );

    const levelCounts = await this.pool.query(
      `SELECT intelligence_level, COUNT(*) as count
       FROM discoveries
       WHERE discovered_at >= $1 AND discovered_at <= $2
       GROUP BY intelligence_level`,
      [startOfDay, endOfDay]
    );

    const discoveries = await this.pool.query(
      `SELECT * FROM discoveries
       WHERE discovered_at >= $1 AND discovered_at <= $2
       ORDER BY threat_score DESC, opportunity_score DESC
       LIMIT 20`,
      [startOfDay, endOfDay]
    );

    const levels: any = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    levelCounts.rows.forEach(row => {
      const level = row.intelligence_level?.toLowerCase();
      if (level && levels.hasOwnProperty(level)) {
        levels[level] = parseInt(row.count);
      }
    });

    return {
      date: targetDate,
      totalDiscoveries: parseInt(totalResult.rows[0]?.count || 0),
      critical: levels.critical,
      high: levels.high,
      medium: levels.medium,
      low: levels.low,
      discoveries: discoveries.rows,
    };
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(weekStart?: Date): Promise<WeeklyReport> {
    const start = weekStart || this.getWeekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // Single query with CTEs instead of 5 separate round trips
    const result = await this.pool.query(
      `WITH base AS (
        SELECT * FROM discoveries WHERE discovered_at >= $1 AND discovered_at < $2
      ),
      counts AS (
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE intelligence_level = 'CRITICAL') as critical,
          COUNT(*) FILTER (WHERE intelligence_level = 'HIGH') as high
        FROM base
      ),
      top_threats AS (
        SELECT * FROM base ORDER BY threat_score DESC LIMIT 10
      ),
      top_opps AS (
        SELECT * FROM base ORDER BY opportunity_score DESC LIMIT 10
      )
      SELECT
        (SELECT row_to_json(counts) FROM counts) as counts,
        (SELECT COALESCE(json_agg(t), '[]'::json) FROM top_threats t) as threats,
        (SELECT COALESCE(json_agg(o), '[]'::json) FROM top_opps o) as opportunities`,
      [start, end]
    );

    const row = result.rows[0];
    const counts = row.counts || { total: 0, critical: 0, high: 0 };
    const topThreats = row.threats || [];
    const topOpportunities = row.opportunities || [];

    const trends = await this.identifyTrends(start, end);

    const costSavings = this.calculateCostSavings(
      topThreats,
      topOpportunities
    );

    return {
      weekStart: start,
      weekEnd: end,
      totalDiscoveries: parseInt(counts.total || 0),
      critical: parseInt(counts.critical || 0),
      high: parseInt(counts.high || 0),
      topThreats,
      topOpportunities,
      trends,
      costSavings,
    };
  }

  async getCriticalDiscoveries(): Promise<Discovery[]> {
    const result = await this.pool.query(
      `SELECT * FROM discoveries
       WHERE intelligence_level = 'CRITICAL'
       AND status = 'analyzed'
       AND discovered_at >= NOW() - INTERVAL '24 hours'
       ORDER BY discovered_at DESC`
    );
    return result.rows;
  }

  async getTodayHighPriority(): Promise<Discovery[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.pool.query(
      `SELECT * FROM discoveries
       WHERE intelligence_level IN ('CRITICAL', 'HIGH')
       AND discovered_at >= $1
       ORDER BY threat_score DESC, opportunity_score DESC`,
      [today]
    );
    return result.rows;
  }

  private async identifyTrends(start: Date, end: Date): Promise<string[]> {
    const trends: string[] = [];

    const result = await this.pool.query(
      `SELECT metadata FROM discoveries
       WHERE discovered_at >= $1 AND discovered_at < $2`,
      [start, end]
    );

    const techCounts: { [key: string]: number } = {};

    result.rows.forEach(row => {
      try {
        const metadata = row.metadata;

        if (metadata?.topics) {
          metadata.topics.forEach((topic: string) => {
            techCounts[topic] = (techCounts[topic] || 0) + 1;
          });
        }

        if (metadata?.language) {
          const lang = metadata.language;
          techCounts[lang] = (techCounts[lang] || 0) + 1;
        }
      } catch (error) {
        // Skip malformed metadata
      }
    });

    const topTech = Object.entries(techCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    topTech.forEach(([tech, count]) => {
      if (count >= 3) {
        trends.push(`${tech}: ${count} mentions (trending)`);
      }
    });

    if (trends.length === 0) {
      trends.push('No significant technology trends detected this week');
    }

    return trends;
  }

  private calculateCostSavings(
    threats: Discovery[],
    opportunities: Discovery[]
  ): number {
    const threatValue = threats.length * 50000;
    const opportunityValue = opportunities.slice(0, 3).length * 100000;
    return threatValue + opportunityValue;
  }

  private getWeekStart(date?: Date): Date {
    const d = date || new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  // No more close() — pool lifecycle owned by database/pool.ts
}
