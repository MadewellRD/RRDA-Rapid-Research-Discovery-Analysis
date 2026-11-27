import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('RDACore (src/core/RDACore.ts)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      GITHUB_TOKEN_1: 'test-token',
      GITHUB_USERNAME_1: 'test-user',
      LLM_PROVIDER: 'bitnet',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('constructs without throwing given the minimum required env vars', async () => {
    const { RDACore } = await import('../core/RDACore.js');
    expect(() => new RDACore()).not.toThrow();
  });

  it('cleanJsonResponse strips a ```json fenced block down to raw JSON', async () => {
    const { RDACore } = await import('../core/RDACore.js');
    const core = new RDACore() as any;
    const fenced = '```json\n{"level":"HIGH"}\n```';
    expect(core.cleanJsonResponse(fenced)).toBe('{"level":"HIGH"}');
  });

  it('cleanJsonResponse strips an unlabeled fenced block', async () => {
    const { RDACore } = await import('../core/RDACore.js');
    const core = new RDACore() as any;
    const fenced = '```\n{"level":"MEDIUM"}\n```';
    expect(core.cleanJsonResponse(fenced)).toBe('{"level":"MEDIUM"}');
  });

  it('cleanJsonResponse passes already-clean JSON through unchanged', async () => {
    const { RDACore } = await import('../core/RDACore.js');
    const core = new RDACore() as any;
    const clean = '{"level":"LOW"}';
    expect(core.cleanJsonResponse(clean)).toBe(clean);
  });
});
