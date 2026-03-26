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

interface ScanJob {
  id: string;
  source: SourceKey;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  discoveredCount?: number;
  storedCount?: number;
  error?: string;
}

const scanJobs: ScanJob[] = [];

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
  const job = scanJobs.find((entry) => entry.id === jobId);
  if (!job) return;

  job.status = 'running';

  const core = new RDACore();
  const pool = getPool();
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

    job.status = 'completed';
    job.discoveredCount = discoveries.length;
    job.storedCount = storedCount;
    job.completedAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO sources (name, category, scan_frequency, last_scan, total_discoveries)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (name)
       DO UPDATE SET last_scan = EXCLUDED.last_scan,
                     total_discoveries = sources.total_discoveries + EXCLUDED.total_discoveries`,
      [source, 'public', 'manual', storedCount]
    );
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown scan error';
    job.completedAt = new Date().toISOString();
  }
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
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
      activeJobs: scanJobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
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

  app.get('/api/v1/jobs', (_req: Request, res: Response) => {
    res.json(scanJobs.slice().reverse().slice(0, 20));
  });

  app.post('/api/v1/admin/scans', async (req: Request, res: Response) => {
    const source = req.body?.source as SourceKey | undefined;
    if (!source || !['github', 'hackernews', 'reddit', 'arxiv'].includes(source)) {
      res.status(400).json({ error: 'source must be one of github, hackernews, reddit, arxiv' });
      return;
    }

    const jobId = `${source}-${Date.now()}`;
    scanJobs.push({
      id: jobId,
      source,
      status: 'queued',
      startedAt: new Date().toISOString(),
    });

    void runScan(source, jobId);

    res.status(202).json({
      id: jobId,
      status: 'queued',
      source,
    });
  });

  return app;
}
