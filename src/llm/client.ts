import OpenAI from 'openai';

function getProvider(): string {
  return process.env.LLM_PROVIDER || 'openai';
}

export function createLLMClient(): OpenAI {
  const provider = getProvider();

  if (provider === 'bitnet') {
    return new OpenAI({
      apiKey: 'not-needed',
      baseURL: process.env.BITNET_BASE_URL || 'http://localhost:8080/v1',
    });
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export function getDefaultModel(): string {
  const provider = getProvider();

  if (provider === 'bitnet') {
    return process.env.BITNET_MODEL || 'bitnet-b1.58-2B-4T';
  }
  return process.env.INNOVATION_MODEL || 'gpt-4o-mini';
}

export function getCreativeModel(): string {
  const provider = getProvider();

  if (provider === 'bitnet') {
    return process.env.BITNET_MODEL || 'bitnet-b1.58-2B-4T';
  }
  return process.env.INNOVATION_CREATIVE_MODEL || 'gpt-4o';
}

export function isLocalProvider(): boolean {
  return getProvider() === 'bitnet';
}
