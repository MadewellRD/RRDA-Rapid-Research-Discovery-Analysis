import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('LLM client factory (src/llm/client.ts)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to the openai provider and its model names when LLM_PROVIDER is unset', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.INNOVATION_MODEL;
    delete process.env.INNOVATION_CREATIVE_MODEL;
    const { isLocalProvider, getDefaultModel, getCreativeModel } = await import('../llm/client.js');
    expect(isLocalProvider()).toBe(false);
    expect(getDefaultModel()).toBe('gpt-4o-mini');
    expect(getCreativeModel()).toBe('gpt-4o');
  });

  it('switches to the bitnet model name for both slots when LLM_PROVIDER=bitnet', async () => {
    process.env.LLM_PROVIDER = 'bitnet';
    delete process.env.BITNET_MODEL;
    const { isLocalProvider, getDefaultModel, getCreativeModel } = await import('../llm/client.js');
    expect(isLocalProvider()).toBe(true);
    expect(getDefaultModel()).toBe('bitnet-b1.58-2B-4T');
    expect(getCreativeModel()).toBe('bitnet-b1.58-2B-4T');
  });

  it('createLLMClient() points at BITNET_BASE_URL for the bitnet provider', async () => {
    process.env.LLM_PROVIDER = 'bitnet';
    process.env.BITNET_BASE_URL = 'http://bitnet-test:9999/v1';
    const { createLLMClient } = await import('../llm/client.js');
    const client = createLLMClient();
    expect(client.baseURL).toBe('http://bitnet-test:9999/v1');
  });

  it('createLLMClient() falls back to the default BitNet URL when BITNET_BASE_URL is unset', async () => {
    process.env.LLM_PROVIDER = 'bitnet';
    delete process.env.BITNET_BASE_URL;
    const { createLLMClient } = await import('../llm/client.js');
    const client = createLLMClient();
    expect(client.baseURL).toBe('http://localhost:8080/v1');
  });
});
