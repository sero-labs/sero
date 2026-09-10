/**
 * Usage aggregation for run stats. Each attempt reports token counts, model time,
 * and cost (priced from the model + tokens by the pi session; absent for unpriced
 * models); this rolls a run's attempts up to a single per-run total for the cards.
 *
 * Every field stays optional and is only present when at least one attempt
 * reported it, so the UI renders a stat only when it actually has data — no
 * misleading zeros (e.g. cost stays hidden for models with no known pricing).
 */

import type { UsageSummary } from './types';

/** Sums usage across step attempts. Returns undefined when no attempt reported any. */
export function aggregateUsage(attempts: ReadonlyArray<{ usage?: UsageSummary }>): UsageSummary | undefined {
  let reported = false;
  let incomplete = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;
  let durationMs = 0;
  let startedCalls = 0;
  let finishedCalls = 0;
  for (const { usage } of attempts) {
    if (!usage) continue;
    reported = true;
    incomplete ||= usage.incomplete === true;
    inputTokens += usage.inputTokens ?? 0;
    outputTokens += usage.outputTokens ?? 0;
    totalTokens += usage.totalTokens ?? 0;
    costUsd += usage.costUsd ?? 0;
    durationMs += usage.durationMs ?? 0;
    startedCalls += usage.startedCalls ?? 0;
    finishedCalls += usage.finishedCalls ?? 0;
  }
  if (!reported) return undefined;
  const usage: UsageSummary = {};
  if (incomplete) usage.incomplete = true;
  if (inputTokens) usage.inputTokens = inputTokens;
  if (outputTokens) usage.outputTokens = outputTokens;
  if (totalTokens) usage.totalTokens = totalTokens;
  if (costUsd) usage.costUsd = costUsd;
  if (durationMs) usage.durationMs = durationMs;
  if (startedCalls) usage.startedCalls = startedCalls;
  if (finishedCalls) usage.finishedCalls = finishedCalls;
  return usage;
}

/** Adds independent operation totals while preserving the incomplete marker. */
export function mergeUsage(...usages: Array<UsageSummary | undefined>): UsageSummary | undefined {
  return aggregateUsage(usages.map((usage) => ({ usage })));
}

/** Returns the newly observed part of a cumulative SDK snapshot. */
export function usageDelta(previous: UsageSummary | undefined, current: UsageSummary): UsageSummary {
  const delta: UsageSummary = {};
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'costUsd', 'durationMs', 'startedCalls', 'finishedCalls'] as const) {
    const value = Math.max(0, (current[key] ?? 0) - (previous?.[key] ?? 0));
    if (value) delta[key] = value;
  }
  if (current.incomplete) delta.incomplete = true;
  return delta;
}

/** Merges two cumulative totals without charging the same snapshot twice. */
export function mergeCumulativeUsage(...usages: Array<UsageSummary | undefined>): UsageSummary | undefined {
  const present = usages.filter((usage): usage is UsageSummary => usage !== undefined);
  if (present.length === 0) return undefined;
  const merged: UsageSummary = {};
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'costUsd', 'durationMs', 'startedCalls', 'finishedCalls'] as const) {
    const value = Math.max(...present.map((usage) => usage[key] ?? 0));
    if (value) merged[key] = value;
  }
  if (present.some((usage) => usage.incomplete)) merged.incomplete = true;
  return merged;
}

/** Strip internal counters and expose interrupted calls as incomplete usage. */
export function reportedUsage(usage: UsageSummary | undefined): UsageSummary | undefined {
  if (!usage) return undefined;
  const { startedCalls = 0, finishedCalls = 0, ...reported } = usage;
  return startedCalls > finishedCalls ? { ...reported, incomplete: true } : reported;
}
