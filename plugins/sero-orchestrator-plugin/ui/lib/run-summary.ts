/**
 * One-line summary of a run's step outcomes for the attempt-history rows, e.g.
 * "2 done · 1 blocked · 1 recovery". Pure (no React) so it's unit-tested directly;
 * the data model's `succeeded`/`needs-revision` present as the wireframe's
 * `done`/`recovering` labels.
 */

import type { LoopRunSummary } from '../../shared/types';

const OUTCOME_LABEL: Record<string, string> = { succeeded: 'done', 'needs-revision': 'recovering' };

export function summarizeRun(run: LoopRunSummary): string {
  if (run.statusReason) {
    if (run.status === 'snoozed' && run.retryAt) {
      return `${run.statusReason} Retry at ${new Date(run.retryAt).toLocaleString()}`;
    }
    return run.statusReason;
  }
  const parts: string[] = [];
  if (run.steps.length > 0) {
    const counts = new Map<string, number>();
    for (const s of run.steps) {
      const key = s.outcomeStatus ?? s.status;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    parts.push(...[...counts].map(([key, n]) => `${n} ${OUTCOME_LABEL[key] ?? key}`));
  }
  if (run.recoveries.length > 0) parts.push(`${run.recoveries.length} recovery`);
  return parts.length ? parts.join(' · ') : 'no steps run';
}
