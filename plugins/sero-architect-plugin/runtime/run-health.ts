import { block, unblock } from '../shared/lifecycle';
import type { RecordStore } from './record-store';

export interface RunHealth {
  status: string;
  startedAt?: string;
  steps?: { stepId: string; status: string; outcomeStatus?: string }[];
  /** The block that ended the run, carrying the limit's own reason rather than a paraphrase. */
  block?: { reason: string; limit?: string };
  /** Steps a restart left in flight, so the page can say which step the run was on. */
  interruptedStepIds?: string[];
}

/**
 * Why the work stopped, in the work's own words wherever the record has them.
 *
 * Three cases and no fourth: the run's own saved reason; a restart, which the
 * run records as facts and this words; or nothing, said plainly rather than
 * filled with a sentence that sounds like a cause the record never held.
 *
 * The step number is stated only when the run's own step order resolves to
 * exactly one interrupted step, so a number is never guessed.
 */
function stopReason(latest: RunHealth): string {
  if (latest.block?.reason) return latest.block.reason;
  const interrupted = latest.interruptedStepIds ?? [];
  if (interrupted.length === 1) {
    const at = (latest.steps ?? []).findIndex((step) => step.stepId === interrupted[0]);
    return at >= 0
      ? `Sero restarted during step ${at + 1} of its Workflow.`
      : 'Sero restarted while its Workflow was mid-step.';
  }
  if (interrupted.length > 1) return `Sero restarted with ${interrupted.length} steps in flight.`;
  return 'The Workflow stopped. No cause was recorded.';
}

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
    if (failed) {
      const reason = stopReason(latest);
      if (dispatch.failure === reason && dispatch.retryStepId === retryStepId) return null;
      const next = { ...record, milestones: record.milestones.map((item) => item.id === milestone.id
        ? { ...item, dispatch: { ...dispatch, failure: reason, retryStepId } } : item) };
      const held = block(next, now, reason);
      // The reason belongs on the activity line, not in `stateLine`: that field
      // is what the Architect reported in its own words, and a stop reason is
      // not something the Architect said.
      return held.ok ? held.record : next;
    }
    if (milestone.dispatch.failure && ['running', 'completed'].includes(latest.status)) {
      const next = { ...record, milestones: record.milestones.map((item) => item.id === milestone.id
        ? { ...item, dispatch: { ...dispatch, failure: undefined, retryStepId: undefined, costLimitUsd: undefined } } : item) };
      if (record.blockedReason !== milestone.dispatch.failure) return next;
      const cleared = unblock(next, now, `workflow ${loopId} resumed`);
      return cleared.ok ? { ...cleared.record, stateLine: `Workflow resumed: ${milestone.title}.` } : next;
    }
    return null;
  });
}
