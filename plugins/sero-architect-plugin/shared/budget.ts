/**
 * What the project may still start.
 *
 * The cap bounds starts, not final spend: work in flight can report more before
 * the next check. So a start is measured against what is free, and free is the
 * cap less what was spent and less what running work was promised and has not
 * used yet. Two parallel starts then cannot each be given the whole remainder.
 *
 * Nothing is stored for this beside the operation it belongs to. The promise
 * lives on the durable entry of the dispatch or research it was made for, so a
 * restart finds every promise once: it cannot lose one or count one twice, and
 * an operation that ends releases what it did not use by no longer being there.
 */

import type { ProjectRecord } from './record';

/** The most one research Room or Workflow is promised at its start. */
export const RESEARCH_START_USD = 5;

const unused = (allocatedUsd: number | undefined, chargedUsd: number | undefined): number =>
  allocatedUsd === undefined ? 0 : Math.max(0, allocatedUsd - (chargedUsd ?? 0));

/** Promised to operations that are still running and not yet spent by them. */
export function outstandingUsd(record: ProjectRecord): number {
  let held = 0;
  for (const milestone of record.milestones) {
    if (milestone.pendingDispatch) held += unused(milestone.pendingDispatch.allocatedUsd, milestone.pendingDispatch.planningChargedUsd);
    else if (milestone.dispatch && milestone.status === 'running') held += unused(milestone.dispatch.allocatedUsd, milestone.dispatch.chargedUsd);
  }
  for (const pending of record.pendingResearch ?? []) held += unused(pending.allocatedUsd, pending.chargedUsd);
  return held;
}

/** Free to start new work. Null when the project has no cap yet. */
export function availableUsd(record: ProjectRecord): number | null {
  if (record.budget.capUsd === null) return null;
  return Math.max(0, record.budget.capUsd - record.budget.spentUsd - outstandingUsd(record));
}

export type Allocation = { ok: true; allocatedUsd?: number } | { ok: false; error: string };

/**
 * Sizes the promise for one start. `askedUsd` is the most the operation wants;
 * null asks for what is free. Call it inside the same write that saves the
 * operation's entry, so two starts are measured one after the other.
 */
export function allocateStart(record: ProjectRecord, askedUsd: number | null): Allocation {
  const free = availableUsd(record);
  // No cap yet: nothing to measure against, and the operation keeps its own limit.
  if (free === null) return { ok: true };
  if (free <= 0) {
    const held = outstandingUsd(record);
    return { ok: false, error: held > 0
      ? `No project budget is free to start new work: $${held.toFixed(2)} is held by work that is still running.`
      : 'The project has no budget remaining.' };
  }
  return { ok: true, allocatedUsd: askedUsd === null ? free : Math.min(askedUsd, free) };
}
