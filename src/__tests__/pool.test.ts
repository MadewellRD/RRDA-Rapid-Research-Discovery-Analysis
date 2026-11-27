import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('database pool (src/database/pool.ts)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;
    const { getPool } = await import('../database/pool.js');
    expect(() => getPool()).toThrow('DATABASE_URL is not set');
  });

  it('returns the same pool instance on repeated calls (singleton)', async () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    const { getPool, closePool } = await import('../database/pool.js');
    const a = getPool();
    const b = getPool();
    expect(a).toBe(b);
    await closePool();
  });

  it('closePool() clears the singleton so the next getPool() returns a fresh instance', async () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    const { getPool, closePool } = await import('../database/pool.js');
    const a = getPool();
    await closePool();
    const b = getPool();
    expect(a).not.toBe(b);
    await closePool();
  });
});
