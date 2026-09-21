/**
 * Lifetime usage + remaining-budget derivation for the loop detail (RR-6).
 *
 * Pure (no host/IO). The renderer watches `runs/index.json`, whose per-run
 * `usage` is that run's own total, and `loop.json`, which keeps the Workflow's
 * planning and auxiliary usage even though its runs are stripped out. Both are
 * needed: summing the runs alone understates the Workflow by whatever it spent
 * planning and reflecting, which is money `maxCostUsd` counts. That gap is why
 * the same Workflow used to read lower here than on Home. `lifetimeUsage` is
 * the one derivation the limit check uses, so the remaining-budget hint now
 * runs out exactly when the limit blocks.
 */

import type { Loop, LoopRunSummary } from '../../shared/types';
import { lifetimeUsage } from '../../shared/usage';
import { formatCost, formatTokens } from './format';

export interface LoopUsageSummary {
  incomplete?: boolean;
  /** Lifetime tokens across all runs (undefined when no run reported tokens). */
  totalTokens?: number;
  /** Lifetime cost across all runs (undefined when no run reported a cost). */
  totalCost?: number;
  /** Tokens left before `maxTotalTokens` (clamped at 0); undefined when no limit. */
  tokensRemaining?: number;
  /** Cost left before `maxCostUsd` (clamped at 0); undefined when no limit. */
  costRemaining?: number;
}

/**
 * Rolls the Workflow's own usage and its runs up to the lifetime total the
 * limits are tested against and, when a token/cost limit is set, the remaining
 * budget. Returns null when there is nothing to show (no usage reported and no
 * budget configured).
 */
export function summarizeLoopUsage(
  loop: Pick<Loop, 'planningUsage' | 'auxiliaryUsage' | 'limits'>,
  runs: LoopRunSummary[],
): LoopUsageSummary | null {
  const total = lifetimeUsage(loop, runs.map((run) => run.usage));
  const { maxTotalTokens, maxCostUsd } = loop.limits;
  if (!total && maxTotalTokens === undefined && maxCostUsd === undefined) return null;

  return {
    ...(total?.incomplete ? { incomplete: true } : {}),
    totalTokens: total?.totalTokens,
    totalCost: total?.costUsd,
    tokensRemaining: maxTotalTokens !== undefined ? Math.max(0, maxTotalTokens - (total?.totalTokens ?? 0)) : undefined,
    costRemaining: maxCostUsd !== undefined ? Math.max(0, maxCostUsd - (total?.costUsd ?? 0)) : undefined,
  };
}

/**
 * One-line label for the usage chip, e.g. "45.2k tok · $1.20 · 55.0k tok left ·
 * $3.80 left". Lifetime totals first, then the remaining-budget hints. Returns
 * null when there is nothing to display.
 */
export function formatLoopUsage(summary: LoopUsageSummary): string | null {
  const parts: string[] = [];
  if (summary.totalTokens !== undefined) parts.push(`${formatTokens(summary.totalTokens)} tok`);
  if (summary.totalCost !== undefined) parts.push(formatCost(summary.totalCost));
  if (summary.tokensRemaining !== undefined) parts.push(`${formatTokens(summary.tokensRemaining)} tok left`);
  if (summary.costRemaining !== undefined) parts.push(`${formatCost(summary.costRemaining)} left`);
  if (summary.incomplete) parts.push('usage incomplete');
  return parts.length ? parts.join(' · ') : null;
}
