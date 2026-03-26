/**
 * Shared database pool — singleton for the entire RDA process.
 *
 * Previously multiple classes created their own `new Pool()`.
 * That wastes connections and makes graceful shutdown unreliable.
 *
 * Usage:
 *   import { getPool, closePool } from '../database/pool.js';
 *   const pool = getPool();          // lazy-init, always same instance
 *   await pool.query('SELECT 1');
 *   // at shutdown:
 *   await closePool();
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

// Ensure env is loaded before first access
dotenv.config();

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — cannot create DB pool');
    }
    _pool = new Pool({
      connectionString,
      max: 10,                   // sensible default for a single-process app
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    // Log connection errors instead of crashing
    _pool.on('error', (err) => {
      console.error('⚠️  Unexpected database pool error:', err.message);
    });

    console.log('🗄️  Database pool created (shared singleton)');
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    console.log('🗄️  Database pool closed');
  }
}
