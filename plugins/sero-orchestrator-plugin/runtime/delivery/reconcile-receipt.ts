import type { Loop, OrchestratorActionResult, StepOutcome } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { applyStepOutcome, recordCompletion } from '../outcomes';
import { finalizationStepId } from '../readiness';
import { settleActivation } from '../activations';
import { applyDeliveryContract } from './verify-receipt';

/** Re-read the last candidate before any action can repeat its write. */
export async function reconcileReceipt(
  host: OrchestratorHost,
  loop: Loop,
  replaceLoop: (next: Loop) => Promise<void>,
): Promise<OrchestratorActionResult | undefined> {
  if (loop.runtime.activeRunId) return undefined;
  const run = loop.runs.at(-1);
  if (run?.completionSignal?.status === 'complete') return undefined;
  const attempt = run && [...run.stepAttempts].reverse().find((candidate) => candidate.stepId === finalizationStepId(loop));
  const review = attempt?.outcome?.deliveryReview;
  const step = attempt && loop.plan.steps.find((candidate) => candidate.id === attempt.stepId);
  if (!run || !attempt || !review || !step) return undefined;
  const candidate: StepOutcome = { status: 'succeeded', summary: review.completion.reason, completion: review.completion };
  const outcome = await applyDeliveryContract(host, loop, step, candidate);
  if (!outcome.completion || outcome.completion.status !== 'complete') return undefined;
  const now = host.now();
  const recorded = { ...attempt, outcome };
  const applied = applyStepOutcome(loop, step.id, recorded, outcome, now);
  const completed = recordCompletion(host, applied, step.id, recorded, outcome);
  let reconciled: typeof run = {
    ...run, status: 'completed' as const, completionSignal: completed.signal, block: undefined,
    stepAttempts: run.stepAttempts.map((entry) => entry.id === attempt.id ? recorded : entry),
  };
  if (attempt.activationId) reconciled = settleActivation(reconciled, attempt.activationId, outcome, now);
  const next: Loop = {
    ...completed.loop,
    status: completed.loop.status === 'blocked' ? 'active' : completed.loop.status,
    runtime: { ...completed.loop.runtime, block: undefined, pendingInput: undefined },
    runs: loop.runs.map((entry) => entry.id === run.id ? reconciled : entry),
  };
  await replaceLoop(next);
  host.notify('Existing delivery verified. No delivery was repeated.', 'info');
  return { ok: true, loop: next, run: reconciled };
}
