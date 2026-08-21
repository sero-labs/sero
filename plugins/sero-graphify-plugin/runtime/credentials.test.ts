import { describe, expect, it } from 'vitest';
import { cleanEnv } from './credentials';

describe('cleanEnv', () => {
  it('keeps the process variables needed for local work', () => {
    const env = cleanEnv({ PATH: '/bin', HOME: '/home/me', LANG: 'en_GB.UTF-8' });
    expect(env).toEqual({ PATH: '/bin', HOME: '/home/me', LANG: 'en_GB.UTF-8' });
  });

  it('removes every backend selector and credential', () => {
    const env = cleanEnv({
      PATH: '/bin',
      OPENAI_API_KEY: 'secret',
      ANTHROPIC_API_KEY: 'secret',
      AWS_PROFILE: 'paid',
      AWS_REGION: 'us-east-1',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_HOST: '127.0.0.1:11434',
      HTTPS_PROXY: 'http://proxy',
    });
    expect(env).toEqual({ PATH: '/bin', HTTPS_PROXY: 'http://proxy' });
  });
});
