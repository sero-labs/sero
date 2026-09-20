import { describe, expect, it } from 'vitest';
import type { Loop, LoopLimits, LoopRunSummary, UsageSummary } from '../../shared/types';
import { formatLoopUsage, summarizeLoopUsage } from '../lib/usage-summary';

const run = (totalTokens?: number, costUsd?: number): LoopRunSummary =>
  ({ usage: totalTokens === undefined && costUsd === undefined ? undefined : { totalTokens, costUsd } } as LoopRunSummary);

type UsageLoop = Pick<Loop, 'planningUsage' | 'auxiliaryUsage' | 'limits'>;

/** A Workflow with no spend of its own, so a case can add only what it tests. */
const workflow = (limits: LoopLimits = {}, own: Partial<UsageLoop> = {}): UsageLoop =>
  ({ limits, ...own });

const usd = (costUsd: number, totalTokens?: number): UsageSummary =>
  (totalTokens === undefined ? { costUsd } : { costUsd, totalTokens });

describe('summarizeLoopUsage', () => {
  it('returns null when there is no usage and no budget', () => {
    expect(summarizeLoopUsage(workflow(), [run()])).toBeNull();
    expect(summarizeLoopUsage(workflow(), [])).toBeNull();
  });

  it('sums lifetime tokens and cost across runs', () => {
    const summary = summarizeLoopUsage(workflow(), [run(1000, 0.5), run(2000, 1.25)]);
    expect(summary).toMatchObject({ totalTokens: 3000, totalCost: 1.75 });
    expect(summary?.tokensRemaining).toBeUndefined();
    expect(summary?.costRemaining).toBeUndefined();
  });

  it('reports remaining budget against the lifetime limits, clamped at zero', () => {
    const limits: LoopLimits = { maxTotalTokens: 10000, maxCostUsd: 2 };
    const summary = summarizeLoopUsage(workflow(limits), [run(3000, 1.5), run(2000, 1)]);
    // 5000 of 10000 tokens used → 5000 left; $2.50 of $2 used → clamped to 0.
    expect(summary).toMatchObject({ totalTokens: 5000, totalCost: 2.5, tokensRemaining: 5000, costRemaining: 0 });
  });

  it('counts what the Workflow spent outside its runs, which the cost limit counts too', () => {
    // The defect this replaced: the page summed the runs only, so a Workflow
    // that had also spent money planning and reflecting read lower here than
    // on Home, while maxCostUsd blocked at the higher figure.
    const loop = workflow({ maxCostUsd: 4.5 }, { planningUsage: usd(0.3, 900), auxiliaryUsage: usd(0.12, 400) });
    const summary = summarizeLoopUsage(loop, [run(2000, 2.13), run(1000, 1)]);
    expect(summary).toMatchObject({ totalTokens: 4300, totalCost: 3.55 });
    expect(summary?.costRemaining).toBeCloseTo(0.95, 10);
  });

  it('reports the same total the cost limit is tested against', () => {
    const planningUsage = usd(0.42);
    const runs = [run(2000, 3.13)];
    const page = summarizeLoopUsage(workflow({ maxCostUsd: 4.5 }, { planningUsage }), runs);
    // What runtime/limits.ts totalCost() adds up for the same record.
    const enforced = (planningUsage.costUsd ?? 0) + (runs[0].usage?.costUsd ?? 0);
    expect(page?.totalCost).toBe(enforced);
  });

  it('runs its remaining budget out exactly where the limit blocks', () => {
    const loop = workflow({ maxCostUsd: 2 }, { planningUsage: usd(0.5) });
    expect(summarizeLoopUsage(loop, [run(undefined, 1.49)])?.costRemaining).toBeCloseTo(0.01, 10);
    expect(summarizeLoopUsage(loop, [run(undefined, 1.5)])?.costRemaining).toBe(0);
  });

  it('shows the full budget as remaining before any run reports usage', () => {
    const summary = summarizeLoopUsage(workflow({ maxTotalTokens: 8000, maxCostUsd: 4 }), []);
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
