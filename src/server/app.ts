import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { getPool } from '../database/pool.js';
import { RDACore } from '../core/RDACore.js';
import { GitHubScanner } from '../scanners/GitHubScanner.js';
import { HackerNewsScanner } from '../scanners/HackerNewsScanner.js';
import { RedditScanner } from '../scanners/RedditScanner.js';
import { ArxivScanner } from '../scanners/ArxivScanner.js';
import { Discovery } from '../types/index.js';

dotenv.config();

type SourceKey = 'github' | 'hackernews' | 'reddit' | 'arxiv';

// scanJobs are persisted in Postgres (scan_jobs table) — no in-memory state.

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getHealth() {
  const pool = getPool();
  await pool.query('SELECT 1');

  const provider = process.env.LLM_PROVIDER || 'openai';
  const llmConfigured = provider === 'bitnet' || Boolean(process.env.OPENAI_API_KEY);

  return {
    status: llmConfigured ? 'ready' : 'degraded',
    checks: {
      database: 'ready',
      llm: llmConfigured ? 'ready' : 'missing_configuration',
    },
    provider,
    timestamp: new Date().toISOString(),
  };
}

async function runScan(source: SourceKey, jobId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE scan_jobs SET status = 'running' WHERE id = $1`, [jobId]);

  const core = new RDACore();
  let discoveries: Discovery[] = [];

  try {
    if (source === 'github') {
      const scanner = new GitHubScanner();
      discoveries = await scanner.scanTrending({
        languages: ['typescript', 'javascript', 'python'],
        since: 'daily',
      });
    } else if (source === 'hackernews') {
      const scanner = new HackerNewsScanner();
      const frontPage = await scanner.scanFrontPage({ minScore: 50 });
      const showHN = await scanner.scanShowHN(20);
      discoveries = [...frontPage, ...showHN];
    } else if (source === 'reddit') {
      const scanner = new RedditScanner();
      discoveries = await scanner.scanSubreddits({
        subreddits: ['programming', 'machinelearning', 'devops', 'webdev'],
        minScore: 50,
      });
    } else {
      const scanner = new ArxivScanner();
      discoveries = await scanner.scanCategories({
        categories: ['cs.AI', 'cs.LG', 'cs.SE', 'cs.CL'],
        maxResults: 12,
      });
    }

    let storedCount = 0;
    for (const discovery of discoveries) {
      try {
        const assessment = await core.assessIntelligence(discovery);
        await core.storeDiscovery(discovery, assessment);
        storedCount++;
      } catch (error) {
        console.error(`[API] Failed to assess/store discovery from ${source}:`, error);
      }
    }

    await pool.query(
      `UPDATE scan_jobs
       SET status = 'completed', completed_at = NOW(),
           discovered_count = $2, stored_count = $3
       WHERE id = $1`,
      [jobId, discoveries.length, storedCount]
    );

    await pool.query(
      `INSERT INTO sources (name, category, scan_frequency, last_scan, total_discoveries)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (name)
       DO UPDATE SET last_scan = EXCLUDED.last_scan,
                     total_discoveries = sources.total_discoveries + EXCLUDED.total_discoveries`,
      [source, 'public', 'manual', storedCount]
    );
  } catch (error) {
    await pool.query(
      `UPDATE scan_jobs SET status = 'failed', completed_at = NOW(), error = $2 WHERE id = $1`,
      [jobId, error instanceof Error ? error.message : 'Unknown scan error']
    );
  }
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4173' }));
  app.use(express.json());

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'RRDA API',
      version: '2.0.0',
      docs: 'See README.md for setup and API usage.',
    });
  });

  app.get(['/health', '/api/v1/health'], async (_req: Request, res: Response) => {
    try {
      res.json(await getHealth());
    } catch (error) {
      res.status(503).json({
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Unknown health error',
      });
    }
  });

  app.get('/api/v1/stats', async (_req: Request, res: Response) => {
    const pool = getPool();
    const [discoveries, critical, high, deepAnalyses, proposals, lastDiscovery] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM discoveries'),
      pool.query(`SELECT COUNT(*)::int AS count FROM discoveries WHERE intelligence_level = 'CRITICAL'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM discoveries WHERE intelligence_level = 'HIGH'`),
      pool.query('SELECT COUNT(*)::int AS count FROM deep_analyses'),
      pool.query('SELECT COUNT(*)::int AS count FROM innovation_proposals'),
      pool.query('SELECT MAX(discovered_at) AS last_discovery_at FROM discoveries'),
    ]);

    res.json({
      totalDiscoveries: discoveries.rows[0]?.count || 0,
      criticalDiscoveries: critical.rows[0]?.count || 0,
      highPriorityDiscoveries: high.rows[0]?.count || 0,
      deepAnalyses: deepAnalyses.rows[0]?.count || 0,
      proposals: proposals.rows[0]?.count || 0,
      lastDiscoveryAt: lastDiscovery.rows[0]?.last_discovery_at || null,
      activeJobs: (await pool.query(`SELECT COUNT(*)::int AS count FROM scan_jobs WHERE status IN ('queued','running')`)).rows[0]?.count || 0,
    });
  });

  app.get('/api/v1/discoveries', async (req: Request, res: Response) => {
    const pool = getPool();
    const page = Math.max(1, toInt(req.query.page as string, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit as string, 25)));
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (req.query.level) {
      params.push(String(req.query.level).toUpperCase());
      where.push(`intelligence_level = $${params.length}`);
    }
    if (req.query.source) {
      params.push(String(req.query.source));
      where.push(`source = $${params.length}`);
    }
    if (req.query.query) {
      params.push(`%${String(req.query.query)}%`);
      where.push(`(title ILIKE $${params.length} OR COALESCE(description, '') ILIKE $${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM discoveries ${whereClause}`, params);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, source, url, title, description, stars, forks, upvotes, comments,
              discovered_at, intelligence_level, threat_score, opportunity_score, status
       FROM discoveries
       ${whereClause}
       ORDER BY discovered_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      items: result.rows,
      page,
      limit,
      total: countResult.rows[0]?.count || 0,
    });
  });

  app.get('/api/v1/discoveries/:id', async (req: Request, res: Response) => {
    const pool = getPool();
    const discoveryId = Number.parseInt(String(req.params.id), 10);
    const discovery = await pool.query('SELECT * FROM discoveries WHERE id = $1', [discoveryId]);

    if (discovery.rows.length === 0) {
      res.status(404).json({ error: 'Discovery not found' });
      return;
    }

    const deepAnalysis = await pool.query(
      `SELECT * FROM deep_analyses WHERE discovery_id = $1 ORDER BY analyzed_at DESC LIMIT 1`,
      [discoveryId]
    );

    res.json({
      ...discovery.rows[0],
      deepAnalysis: deepAnalysis.rows[0] || null,
    });
  });

  app.get('/api/v1/reports/deep-analyses', async (_req: Request, res: Response) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT da.id, da.discovery_id, da.analyzed_at, da.total_loc, da.file_count,
              da.frameworks, da.architecture_pattern, da.ai_competitive_analysis,
              d.title, d.source, d.url
       FROM deep_analyses da
       JOIN discoveries d ON d.id = da.discovery_id
       ORDER BY da.analyzed_at DESC
       LIMIT 20`
    );
    res.json(result.rows);
  });

  app.get('/api/v1/proposals', async (_req: Request, res: Response) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, concept, problem_statement, inspiration_sources, target_users,
              capabilities, novelty_score, reasoning, status, created_at
       FROM innovation_proposals
       ORDER BY created_at DESC
       LIMIT 20`
    );
    res.json(result.rows);
  });

  app.get('/api/v1/sources', async (_req: Request, res: Response) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT s.name, s.category, s.enabled, s.scan_frequency, s.last_scan, s.total_discoveries,
              COUNT(d.id)::int AS recent_discoveries
       FROM sources s
       LEFT JOIN discoveries d ON d.source = s.name
         AND d.discovered_at > NOW() - INTERVAL '7 days'
       GROUP BY s.id
       ORDER BY s.name ASC`
    );
    res.json(result.rows);
  });

  app.get('/api/v1/jobs', async (_req: Request, res: Response) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, source, status, started_at AS "startedAt", completed_at AS "completedAt",
              discovered_count AS "discoveredCount", stored_count AS "storedCount", error
       FROM scan_jobs
       ORDER BY started_at DESC
       LIMIT 20`
    );
    res.json(result.rows);
  });

  // ─── Admin auth middleware ────────────────────────────────────────
  app.use('/api/v1/admin', (req: Request, res: Response, next) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Admin endpoints disabled: API_KEY env var not configured' });
      return;
    }
    const provided = req.headers['x-api-key'] ?? req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (provided !== apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.post('/api/v1/admin/scans', async (req: Request, res: Response) => {
    const source = req.body?.source as SourceKey | undefined;
    if (!source || !['github', 'hackernews', 'reddit', 'arxiv'].includes(source)) {
      res.status(400).json({ error: 'source must be one of github, hackernews, reddit, arxiv' });
      return;
    }

    const pool = getPool();
    const jobId = `${source}-${Date.now()}`;
    await pool.query(
      `INSERT INTO scan_jobs (id, source, status, started_at) VALUES ($1, $2, 'queued', NOW())`,
      [jobId, source]
    );

    void runScan(source, jobId);

    res.status(202).json({
      id: jobId,
      status: 'queued',
      source,
    });
  });

  // ─── Config endpoints ─────────────────────────────────────────────

  /**
   * GET /api/v1/admin/config
   * Returns all config rows. Secret values are masked unless ?reveal=1 is passed
   * (useful for copying to a new environment — still requires auth).
   */
  app.get('/api/v1/admin/config', async (req: Request, res: Response) => {
    const pool = getPool();
    const reveal = req.query.reveal === '1';
    const result = await pool.query(
      `SELECT key, value, secret, description, updated_at FROM config ORDER BY key`
    );
    const rows = result.rows.map((r) => ({
      key: r.key,
      value: r.secret && !reveal ? (r.value ? '••••••••' : '') : r.value,
      secret: r.secret,
      description: r.description,
      updatedAt: r.updated_at,
    }));
    res.json(rows);
  });

  /**
   * PATCH /api/v1/admin/config
   * Body: { "KEY": "value", ... }
   * Values equal to '••••••••' are skipped (unchanged masked secret).
   */
  app.patch('/api/v1/admin/config', async (req: Request, res: Response) => {
    const pool = getPool();
    const updates = req.body as Record<string, string>;
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'Body must be a flat key/value object' });
      return;
    }

    const skipped: string[] = [];
    const updated: string[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (value === '••••••••') {
        skipped.push(key);
        continue;
      }
      const result = await pool.query(
        `UPDATE config SET value = $2, updated_at = NOW() WHERE key = $1 RETURNING key`,
        [key, value]
      );
      if (result.rowCount && result.rowCount > 0) {
        updated.push(key);
      }
    }

    res.json({ ok: true, updated, skipped });
  });

  return app;
}
