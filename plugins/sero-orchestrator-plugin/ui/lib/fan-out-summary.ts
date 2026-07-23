/**
 * Fan-out activation summary for the plan view (specs/17-dynamic-fan-out.md):
 * the latest run's per-item activations of one fan-out step, joined into the
 * counts + rows the StepCard activation group renders.
 */

import type { LoopRun, StepActivationStatus, StepStatus } from '../../shared/types';

export interface FanOutItemView {
  key: string;
  status: StepStatus;
  summary?: string;
}

export interface FanOutView {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  skipped: number;
  items: FanOutItemView[];
}

/** Activation statuses folded onto the shared step-status visual language. */
function displayStatus(status: StepActivationStatus): StepStatus {
  return status === 'cancelled' || status === 'orphaned' ? 'failed' : status;
}

/** The newest run's fan-out activations for a step; undefined before any expansion. */
export function fanOutView(runs: LoopRun[], stepId: string): FanOutView | undefined {
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const activations = (runs[i].stepActivations ?? []).filter((a) => a.stepId === stepId && a.fanOut);
    if (activations.length === 0) continue;
    const items = [...activations]
      .sort((a, b) => (a.fanOut!.index) - (b.fanOut!.index))
      .map((a) => ({ key: a.fanOut!.key, status: displayStatus(a.status), summary: a.outcome?.summary }));
    const count = (status: StepStatus) => items.filter((item) => item.status === status).length;
    return {
      total: items.length,
      succeeded: count('succeeded'),
      failed: count('failed') + count('blocked') + count('needs-revision'),
      running: count('running'),
      skipped: count('skipped'),
      items,
    };
  }
  return undefined;
}

/** Compact headline, e.g. "3 of 3 succeeded" or "2 of 5 succeeded · 1 failed · 2 running". */
export function fanOutSummaryLabel(view: FanOutView): string {
  const parts = [`${view.succeeded} of ${view.total} succeeded`];
  if (view.failed > 0) parts.push(`${view.failed} failed`);
  if (view.running > 0) parts.push(`${view.running} running`);
  if (view.skipped > 0) parts.push(`${view.skipped} skipped`);
  return parts.join(' · ');
}
