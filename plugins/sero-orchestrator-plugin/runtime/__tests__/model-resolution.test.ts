import { describe, expect, it } from 'vitest';
import type { SharedAvailableModelGroup } from '@sero-ai/common';
import { FALLBACK_TIER, resolveStepModel } from '../model-resolution';

const GROUPS: SharedAvailableModelGroup[] = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [
      { provider: 'anthropic', modelId: 'claude-opus-4-8', name: 'Claude Opus 4.8', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', reasoning: false },
    ],
  },
];

describe('resolveStepModel', () => {
  it('passes through "no preference" (undefined) so the host default is used', () => {
    expect(resolveStepModel(undefined, GROUPS)).toEqual({});
  });

  it('passes tiers through unchanged (always resolvable symbolically)', () => {
    expect(resolveStepModel('LOW', GROUPS)).toEqual({ model: 'LOW' });
    expect(resolveStepModel('MED', GROUPS)).toEqual({ model: 'MED' });
    expect(resolveStepModel('HIGH', GROUPS)).toEqual({ model: 'HIGH' });
  });

  it('passes a pinned model through when it is available', () => {
    expect(resolveStepModel('anthropic/claude-opus-4-8', GROUPS)).toEqual({
      model: 'anthropic/claude-opus-4-8',
    });
  });

  it('falls back to MED and reports the requested ref when a pinned model is gone', () => {
    expect(resolveStepModel('openai/gpt-9', GROUPS)).toEqual({
      model: FALLBACK_TIER,
      fallbackFrom: 'openai/gpt-9',
    });
  });

  it('falls back when no models are available at all', () => {
    expect(resolveStepModel('anthropic/claude-opus-4-8', [])).toEqual({
      model: FALLBACK_TIER,
      fallbackFrom: 'anthropic/claude-opus-4-8',
    });
  });
});
