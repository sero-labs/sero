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
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;
  let durationMs = 0;
  for (const { usage } of attempts) {
    if (!usage) continue;
    reported = true;
    inputTokens += usage.inputTokens ?? 0;
    outputTokens += usage.outputTokens ?? 0;
    totalTokens += usage.totalTokens ?? 0;
    costUsd += usage.costUsd ?? 0;
    durationMs += usage.durationMs ?? 0;
  }
  if (!reported) return undefined;
  const usage: UsageSummary = {};
  if (inputTokens) usage.inputTokens = inputTokens;
  if (outputTokens) usage.outputTokens = outputTokens;
  if (totalTokens) usage.totalTokens = totalTokens;
  if (costUsd) usage.costUsd = costUsd;
  if (durationMs) usage.durationMs = durationMs;
  return usage;
}
