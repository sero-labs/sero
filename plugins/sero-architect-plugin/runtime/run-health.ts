import { block, unblock } from '../shared/lifecycle';
import type { RecordStore } from './record-store';

export interface RunHealth { status: string; startedAt?: string }

/** A workflow may stay enabled even when its last execution was interrupted. */
export async function applyRunHealth(store: RecordStore, projectId: string, loopId: string, runs: RunHealth[], now: string): Promise<void> {
  const latest = runs.toSorted((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
  if (!latest) return;
  const failed = ['orphaned', 'failed', 'cancelled'].includes(latest.status);
  await store.update(projectId, (record) => {
    const milestone = record.milestones.find((item) => item.dispatch?.id === loopId);
    if (!milestone?.dispatch || milestone.status === 'done') return null;
    const dispatch = milestone.dispatch;
    const reason = `“${milestone.title}” stopped before it finished. Open the workflow and choose Retry step to continue from the failed step.`;
    if (failed && milestone.dispatch.failure !== reason) {
      const next = { ...record, milestones: record.milestones.map((item) => item.id === milestone.id
        ? { ...item, dispatch: { ...dispatch, failure: reason } } : item) };
      const held = block(next, now, reason);
      return held.ok ? { ...held.record, stateLine: 'A workflow needs to be retried.' } : next;
    }
    if (!failed && milestone.dispatch.failure && ['running', 'completed'].includes(latest.status)) {
      const next = { ...record, milestones: record.milestones.map((item) => item.id === milestone.id
        ? { ...item, dispatch: { ...dispatch, failure: undefined } } : item) };
      if (record.blockedReason !== milestone.dispatch.failure) return next;
      const cleared = unblock(next, now, `workflow ${loopId} resumed`);
      return cleared.ok ? { ...cleared.record, stateLine: `Workflow resumed: ${milestone.title}.` } : next;
    }
    return null;
  });
}
