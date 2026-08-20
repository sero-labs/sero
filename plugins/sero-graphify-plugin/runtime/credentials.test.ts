import { describe, expect, it } from 'vitest';
import { BACKEND_PROVIDERS, cleanEnv, extractionEnv, MAX_RETRIES } from './credentials';
import type { ModelChoice } from '../shared/types';

const choice = (backend: ModelChoice['backend'], modelId = 'test-model'): ModelChoice =>
  ({ backend, modelId, chosenAt: 'now' });

describe('extractionEnv', () => {
  it('injects the matching provider key', async () => {
    const env = await extractionEnv(choice('claude'), async (id) =>
      id === 'anthropic' ? { envVar: 'ANTHROPIC_API_KEY', key: 'sk-test' } : null, {});
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it('throws a clear error when the key is missing', async () => {
    await expect(extractionEnv(choice('openai'), async () => null, {})).rejects.toThrow(/OpenAI/i);
  });

  it('requires no key for ollama or the Claude Code CLI', async () => {
    expect(await extractionEnv(choice('ollama'), async () => null, {})).toBeDefined();
    expect(await extractionEnv(choice('claude-cli'), async () => null, {})).toBeDefined();
  });

  it('sets the backend model variable as well as the flag', async () => {
    // `cluster-only` resolves the backend default and ignores --model entirely,
    // so only this variable reaches the community-naming pass.
    const env = await extractionEnv(choice('openai', 'gpt-5.6-luna'), async () => ({ envVar: 'OPENAI_API_KEY', key: 'k' }), {});
    expect(env.GRAPHIFY_OPENAI_MODEL).toBe('gpt-5.6-luna');
  });

  it('caps retries so one bad response cannot fan out into a bisection storm', async () => {
    const env = await extractionEnv(choice('ollama'), async () => null, {});
    expect(env.GRAPHIFY_MAX_RETRIES).toBe(MAX_RETRIES);
  });

  it('maps every backend', () => {
    // Azure and Bedrock are deliberately absent: neither maps to a Sero
    // provider credential, so both would depend on ambient environment
    // variables — a backend you can pick but cannot configure.
    expect(Object.keys(BACKEND_PROVIDERS).sort()).toEqual(
      ['claude', 'claude-cli', 'deepseek', 'gemini', 'kimi', 'ollama', 'openai'],
    );
  });
});

describe('cleanEnv', () => {
  it('drops other providers keys so the naming pass cannot be captured', () => {
    const env = cleanEnv('claude', {
      PATH: '/bin',
      GEMINI_API_KEY: 'leaked',
      GOOGLE_API_KEY: 'leaked',
      MOONSHOT_API_KEY: 'leaked',
      ANTHROPIC_API_KEY: 'also-dropped-until-injected',
    });
    expect(env.PATH).toBe('/bin');
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GOOGLE_API_KEY).toBeUndefined();
    expect(env.MOONSHOT_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('keeps what a child genuinely needs', () => {
    const env = cleanEnv('claude', { PATH: '/bin', HOME: '/home/me', HTTPS_PROXY: 'http://proxy', LANG: 'en_GB.UTF-8' });
    expect(env).toMatchObject({ PATH: '/bin', HOME: '/home/me', HTTPS_PROXY: 'http://proxy', LANG: 'en_GB.UTF-8' });
  });

  it('passes a backend its own environment settings', () => {
    const env = cleanEnv('ollama', { OLLAMA_BASE_URL: 'http://127.0.0.1:11434', GEMINI_API_KEY: 'leaked' });
    expect(env.OLLAMA_BASE_URL).toBe('http://127.0.0.1:11434');
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });
});
