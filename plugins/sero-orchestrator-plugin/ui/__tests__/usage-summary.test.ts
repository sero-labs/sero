import { describe, expect, it } from 'vitest';
import type { LoopLimits, LoopRunSummary } from '../../shared/types';
import { formatLoopUsage, summarizeLoopUsage } from '../lib/usage-summary';

const run = (totalTokens?: number, costUsd?: number): LoopRunSummary =>
  ({ usage: totalTokens === undefined && costUsd === undefined ? undefined : { totalTokens, costUsd } } as LoopRunSummary);

describe('summarizeLoopUsage', () => {
  it('returns null when there is no usage and no budget', () => {
    expect(summarizeLoopUsage([run()], {})).toBeNull();
    expect(summarizeLoopUsage([], {})).toBeNull();
  });

  it('sums lifetime tokens and cost across runs', () => {
    const summary = summarizeLoopUsage([run(1000, 0.5), run(2000, 1.25)], {});
    expect(summary).toMatchObject({ totalTokens: 3000, totalCost: 1.75 });
    expect(summary?.tokensRemaining).toBeUndefined();
    expect(summary?.costRemaining).toBeUndefined();
  });

  it('reports remaining budget against the lifetime limits, clamped at zero', () => {
    const limits: LoopLimits = { maxTotalTokens: 10000, maxCostUsd: 2 };
    const summary = summarizeLoopUsage([run(3000, 1.5), run(2000, 1)], limits);
    // 5000 of 10000 tokens used → 5000 left; $2.50 of $2 used → clamped to 0.
    expect(summary).toMatchObject({ totalTokens: 5000, totalCost: 2.5, tokensRemaining: 5000, costRemaining: 0 });
  });

  it('shows the full budget as remaining before any run reports usage', () => {
    const summary = summarizeLoopUsage([], { maxTotalTokens: 8000, maxCostUsd: 4 });
    expect(summary).toMatchObject({ tokensRemaining: 8000, costRemaining: 4 });
    expect(summary?.totalTokens).toBeUndefined();
    expect(summary?.totalCost).toBeUndefined();
  });
});

describe('formatLoopUsage', () => {
  it('lists lifetime totals then the remaining-budget hints', () => {
    expect(formatLoopUsage({ totalTokens: 45200, totalCost: 1.2, tokensRemaining: 54800, costRemaining: 3.8 }))
      .toBe('45.2k tok · $1.20 · 54.8k tok left · $3.80 left');
  });

  it('shows totals alone when there is no budget', () => {
    expect(formatLoopUsage({ totalTokens: 920, totalCost: 0.05 })).toBe('920 tok · $0.05');
  });

  it('returns null when there is nothing to display', () => {
    expect(formatLoopUsage({})).toBeNull();
  });
});
