/**
 * Shared database pool for RDA
 * Single Pool instance used by all modules.
 * Replaces per-class Pool() instantiation.
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('💀 Unexpected database pool error:', err.message);
    });

    console.log('🗄️  Database pool initialized');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🗄️  Database pool closed');
  }
}
