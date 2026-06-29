/**
 * Lifetime usage + remaining-budget derivation for the loop detail (RR-6).
 *
 * Pure (no host/IO): the renderer already watches `runs/index.json`, whose
 * per-run `usage` is each run's rolled-up total (the same aggregation the engine
 * uses for limit enforcement, `runtime/limits.ts`). Summing those run totals
 * therefore equals the engine's lifetime spend, so the remaining-budget hint
 * lines up exactly with when a `maxTotalTokens` / `maxCostUsd` limit would block.
 */

import type { LoopLimits, LoopRunSummary } from '../../shared/types';
import { aggregateUsage } from '../../shared/usage';
import { formatCost, formatTokens } from './format';

export interface LoopUsageSummary {
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
 * Rolls run usage up to a lifetime total and, when a token/cost limit is set,
 * the remaining budget. Returns null when there is nothing to show (no usage
 * reported and no budget configured).
 */
export function summarizeLoopUsage(runs: LoopRunSummary[], limits: LoopLimits): LoopUsageSummary | null {
  const total = aggregateUsage(runs);
  const { maxTotalTokens, maxCostUsd } = limits;
  if (!total && maxTotalTokens === undefined && maxCostUsd === undefined) return null;

  return {
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
  return parts.length ? parts.join(' · ') : null;
}
