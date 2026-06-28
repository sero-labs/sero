import { describe, expect, it } from 'vitest';
import { aggregateUsage } from '../usage';

describe('aggregateUsage', () => {
  it('returns undefined when no attempt reported usage', () => {
    expect(aggregateUsage([])).toBeUndefined();
    expect(aggregateUsage([{}, { usage: undefined }])).toBeUndefined();
  });

  it('sums tokens, cost, and model time across attempts', () => {
    const total = aggregateUsage([
      { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, durationMs: 1000 } },
      { usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, durationMs: 500, costUsd: 0.01 } },
    ]);
    expect(total).toEqual({ inputTokens: 150, outputTokens: 30, totalTokens: 180, durationMs: 1500, costUsd: 0.01 });
  });

  it('omits fields no attempt reported (so the UI hides them — e.g. cost today)', () => {
    const total = aggregateUsage([
      { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, durationMs: 200 } },
    ]);
    expect(total).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, durationMs: 200 });
    expect(total).not.toHaveProperty('costUsd');
  });
});
