import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getLlmConfig,
  getLlmCredentialEnvKeys,
  getLlmCredentialEnvVars,
  getLlmLaunchEnv,
  getLlmMode,
  hasLlmCredentials,
  loadE2eEnv,
  requireLlm,
  requireLlmReady,
  type LlmMode,
} from '../llm';

describe('llm helper', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    process.env.SERO_E2E_SKIP_ENV_FILE = '1';
    delete process.env.SERO_E2E_LLM_MODE;
    delete process.env.SERO_E2E_LLM_PROVIDER;
    delete process.env.SERO_E2E_LLM_MODEL;
    delete process.env.SERO_E2E_LLM_ALT_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  describe('getLlmMode', () => {
    it('defaults to "off" when no env is set', () => {
      expect(getLlmMode()).toBe<LlmMode>('off');
    });

    it('reads "cheap" from SERO_E2E_LLM_MODE', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(getLlmMode()).toBe<LlmMode>('cheap');
    });

    it('reads "full" from SERO_E2E_LLM_MODE', () => {
      process.env.SERO_E2E_LLM_MODE = 'full';
      expect(getLlmMode()).toBe<LlmMode>('full');
    });

    it('throws on invalid mode rather than silently falling back', () => {
      process.env.SERO_E2E_LLM_MODE = 'medium';
      expect(() => getLlmMode()).toThrow(/SERO_E2E_LLM_MODE/);
    });
  });

  describe('requireLlm', () => {
    it('returns a Playwright-compatible skip object when mode is "off"', () => {
      const result = requireLlm();
      expect(result.skip).toBe(true);
      expect(result.reason).toMatch(/SERO_E2E_LLM_MODE=off/);
    });

    it('returns skip:false when mode is "cheap"', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(requireLlm()).toEqual({ skip: false });
    });

    it('returns skip:false when mode is "full"', () => {
      process.env.SERO_E2E_LLM_MODE = 'full';
      expect(requireLlm()).toEqual({ skip: false });
    });
  });

  describe('getLlmConfig', () => {
    it('returns null when mode is off', () => {
      expect(getLlmConfig()).toBeNull();
    });

    it('uses Anthropic cheap defaults', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(getLlmConfig()).toEqual({
        mode: 'cheap',
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });
    });

    it('honours provider, model, and alternate model overrides', () => {
      process.env.SERO_E2E_LLM_MODE = 'full';
      process.env.SERO_E2E_LLM_PROVIDER = 'openai';
      process.env.SERO_E2E_LLM_MODEL = 'gpt-test';
      process.env.SERO_E2E_LLM_ALT_MODEL = 'gpt-alt-test';
      expect(getLlmConfig()).toEqual({
        mode: 'full',
        provider: 'openai',
        modelId: 'gpt-test',
        alternateModelId: 'gpt-alt-test',
      });
    });
  });

  describe('credentials and env loading', () => {
    it('loads .env.test style values without mutating process env', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-llm-test-'));
      const file = path.join(dir, '.env.test');
      process.env.ANTHROPIC_API_KEY = 'from-shell';
      fs.writeFileSync(file, 'SERO_E2E_LLM_MODE=cheap\nANTHROPIC_API_KEY=from-file\nOPENAI_API_KEY="quoted"\n');

      const values = loadE2eEnv(file);

      expect(values).toEqual({
        SERO_E2E_LLM_MODE: 'cheap',
        ANTHROPIC_API_KEY: 'from-file',
        OPENAI_API_KEY: 'quoted',
      });
      expect(process.env.SERO_E2E_LLM_MODE).toBeUndefined();
      expect(process.env.ANTHROPIC_API_KEY).toBe('from-shell');
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('lists all known provider credential keys for launch env sanitization', () => {
      expect(getLlmCredentialEnvKeys()).toEqual([
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
      ]);
    });

    it('detects provider credential env vars', () => {
      expect(getLlmCredentialEnvVars('anthropic')).toEqual(['ANTHROPIC_API_KEY']);
      expect(hasLlmCredentials('anthropic')).toBe(false);
      process.env.ANTHROPIC_API_KEY = 'test-key';
      expect(hasLlmCredentials('anthropic')).toBe(true);
    });

    it('requires credentials for ready checks', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(requireLlmReady()).toEqual(expect.objectContaining({ skip: true }));
      process.env.ANTHROPIC_API_KEY = 'test-key';
      expect(requireLlmReady()).toEqual({ skip: false });
    });

    it('fails fast in CI when enabled credentials are missing', () => {
      process.env.CI = 'true';
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(() => requireLlmReady()).toThrow(/CI agent e2e runs must fail fast/);
    });

    it('returns only non-empty selected-provider launch env values', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      process.env.ANTHROPIC_API_KEY = 'secret';
      process.env.OPENAI_API_KEY = 'other-secret';
      process.env.SERO_E2E_LLM_ALT_MODEL = 'claude-alt-test';
      expect(getLlmLaunchEnv()).toEqual({
        SERO_E2E_LLM_MODE: 'cheap',
        SERO_E2E_LLM_PROVIDER: 'anthropic',
        SERO_E2E_LLM_MODEL: 'claude-haiku-4-5',
        SERO_E2E_LLM_ALT_MODEL: 'claude-alt-test',
        ANTHROPIC_API_KEY: 'secret',
      });
    });
  });
});
