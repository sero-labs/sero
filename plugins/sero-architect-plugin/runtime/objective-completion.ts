import type { ProjectRecord } from '../shared/record';
import { closeRun } from '../shared/runs';

/** Delivery and research can finish in either order. Repeated observations are harmless. */
export function closeDeliveredObjectives(record: ProjectRecord, now: string): ProjectRecord {
  let next = record;
  for (const run of record.runs ?? []) {
    if (run.kind !== 'maintenance' || run.endedAt !== null) continue;
    const milestones = record.milestones.filter((entry) => (entry.runId ?? entry.dispatch?.runId) === run.id);
    if (!milestones.length || !milestones.every((entry) => entry.verification === 'delivered')) continue;
    if (record.pendingResearch?.some((entry) => entry.project?.runId === run.id)) continue;
    next = closeRun(next, run.id, 'delivered', now);
  }
  return next;
}
