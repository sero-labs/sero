import type { Loop, OrchestratorActionResult } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { uncertainExternalDeliveryInRun } from './delivery-contract';

/** Direct actions also reach agents. A retry command alone is not a destination review. */
export async function requireExternalReview(
  host: OrchestratorHost,
  loop: Loop,
  replaceLoop: (next: Loop) => Promise<void>,
): Promise<OrchestratorActionResult | undefined> {
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
    await replaceLoop(next);
    host.notify('Check the delivery destination before recovering this workflow.', 'info');
    return { ok: false, error: reason, loop: next };
  }
  return { ok: false, error: reason, loop };
}
