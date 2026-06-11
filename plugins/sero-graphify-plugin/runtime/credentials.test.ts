import { describe, expect, it } from 'vitest';
import { BACKEND_PROVIDERS, extractionEnv } from './credentials';

describe('extractionEnv', () => {
  it('injects the matching provider key', async () => {
    const env = await extractionEnv('claude', async (id) =>
      id === 'anthropic' ? { envVar: 'ANTHROPIC_API_KEY', key: 'sk-test' } : null, {});
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it('throws a clear error when the key is missing', async () => {
    await expect(extractionEnv('openai', async () => null, {})).rejects.toThrow(/OpenAI/i);
  });

  it('requires no key for ollama', async () => {
    const env = await extractionEnv('ollama', async () => null, {});
    expect(env).toBeDefined();
  });

  it('maps every backend', () => {
    expect(Object.keys(BACKEND_PROVIDERS).sort()).toEqual(['claude', 'deepseek', 'gemini', 'kimi', 'ollama', 'openai']);
  });
});
