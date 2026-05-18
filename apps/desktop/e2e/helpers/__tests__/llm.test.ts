import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLlmMode, requireLlm, type LlmMode } from '../llm';

describe('llm helper', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    delete process.env.SERO_E2E_LLM_MODE;
    delete process.env.SERO_E2E_LLM_PROVIDER;
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
});
