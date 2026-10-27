import type { Loop, OrchestratorActionResult } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { uncertainExternalDeliveryInRun } from './delivery-contract';
import { reconcileReceipt, sameReconciliationContext } from './reconcile-receipt';

/** Direct actions also reach agents. A retry command alone is not a destination review. */
export async function requireExternalReview(
  host: OrchestratorHost,
  loop: Loop,
): Promise<OrchestratorActionResult | undefined> {
  const reconciled = await reconcileReceipt(host, loop);
  if (reconciled) return reconciled;
  const uncertain = [...loop.runs].reverse().map((run) => uncertainExternalDeliveryInRun(loop, run)).find(Boolean);
  if (!uncertain) return undefined;
  const existing = loop.runtime.pendingInput;
  const reason = `${uncertain.reason} Answer the destination review question, then choose the recovery action.`;
  if (existing && existing.externalDeliveryAttemptId !== uncertain.attemptId) {
    return { ok: false, error: reason, loop };
  }
  if (!existing) {
    const next: Loop = { ...loop, runtime: { ...loop.runtime, pendingInput: {
      id: host.newId('input'), source: 'step', stepId: uncertain.stepId,
      externalDeliveryAttemptId: uncertain.attemptId, askedAt: host.now(),
      questions: [{ id: 'destination-reviewed',
        prompt: `${uncertain.reason} Only allow recovery after you check whether delivery happened and confirm that repeating it is safe. This does not grant new delivery permissions.`,
        choices: [
          { id: 'reviewed-safe', label: 'I checked the destination. Repeating delivery is safe.' },
          { id: 'hold', label: 'Keep this workflow on hold.' },
        ],
      }],
    } } };
    let saved = false;
    let latest: Loop | undefined;
    await host.updateState((state) => {
      latest = state.loops.find((entry) => entry.id === loop.id);
      if (!latest || !sameReconciliationContext(loop, latest)) return state;
      saved = true;
      return { ...state, loops: state.loops.map((entry) => entry.id === loop.id
        ? { ...entry, runtime: { ...entry.runtime, pendingInput: next.runtime.pendingInput } } : entry) };
    });
    if (!saved) return { ok: false, error: 'Workflow changed during delivery review. Review its current state before retrying.', loop: latest };
    host.notify('Check the delivery destination before recovering this workflow.', 'info');
    return { ok: false, error: reason, loop: next };
  }
  return { ok: false, error: reason, loop };
}
