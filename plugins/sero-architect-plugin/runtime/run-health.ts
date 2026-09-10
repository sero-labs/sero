import { block, unblock } from '../shared/lifecycle';
import type { RecordStore } from './record-store';

export interface RunHealth { status: string; startedAt?: string; steps?: { stepId: string; status: string; outcomeStatus?: string }[] }

/** A workflow may stay enabled even when its last execution was interrupted. */
export async function applyRunHealth(store: RecordStore, projectId: string, loopId: string, runs: RunHealth[], now: string): Promise<void> {
  const latest = runs.toSorted((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
  if (!latest) return;
  await store.update(projectId, (record) => {
    const milestone = record.milestones.find((item) => item.dispatch?.id === loopId);
    if (!milestone?.dispatch || milestone.status === 'done') return null;
    const dispatch = milestone.dispatch;
    const retryStepId = latest.steps?.find((step) => ['orphaned', 'failed', 'cancelled', 'blocked'].includes(step.status) || ['failed', 'blocked'].includes(step.outcomeStatus ?? ''))?.stepId;
    // A worker can finish normally while its structured outcome blocks the run.
    // Limit-only blocks have no retryable step and keep their cap/time recovery.
    const failed = ['orphaned', 'failed', 'cancelled'].includes(latest.status)
      || (latest.status === 'blocked' && retryStepId !== undefined && dispatch.costLimitUsd === undefined);
    const reason = `“${milestone.title}” stopped before it finished. Use Retry step here to continue from the failed step.`;
    if (failed && (milestone.dispatch.failure !== reason || milestone.dispatch.retryStepId !== retryStepId)) {
      const next = { ...record, milestones: record.milestones.map((item) => item.id === milestone.id
        ? { ...item, dispatch: { ...dispatch, failure: reason, retryStepId } } : item) };
      const held = block(next, now, reason);
      return held.ok ? { ...held.record, stateLine: 'A workflow needs to be retried.' } : next;
    }
    if (!failed && milestone.dispatch.failure && ['running', 'completed'].includes(latest.status)) {
      const next = { ...record, milestones: record.milestones.map((item) => item.id === milestone.id
        ? { ...item, dispatch: { ...dispatch, failure: undefined, retryStepId: undefined, costLimitUsd: undefined } } : item) };
      if (record.blockedReason !== milestone.dispatch.failure) return next;
      const cleared = unblock(next, now, `workflow ${loopId} resumed`);
      return cleared.ok ? { ...cleared.record, stateLine: `Workflow resumed: ${milestone.title}.` } : next;
    }
    return null;
  });
}
