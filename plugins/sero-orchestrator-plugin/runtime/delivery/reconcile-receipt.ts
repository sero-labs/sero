import type { Loop, OrchestratorActionResult, StepOutcome } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { applyStepOutcome, recordCompletion } from '../outcomes';
import { finalizationStepId } from '../readiness';
import { settleActivation } from '../activations';
import { receiptRequirement } from './delivery-contract';
import { effectiveDelivery } from '../../shared/delivery-types';
import { applyDeliveryContract } from './verify-receipt';

/** Re-read the last candidate before any action can repeat its write. */
export async function reconcileReceipt(
  host: OrchestratorHost,
  loop: Loop,
): Promise<OrchestratorActionResult | undefined> {
  if (loop.runtime.activeRunId) return undefined;
  const run = loop.runs.at(-1);
  if (run?.completionSignal?.status === 'complete') return undefined;
  const attempt = run && [...run.stepAttempts].reverse().find((candidate) => candidate.stepId === finalizationStepId(loop));
  const review = attempt?.outcome?.deliveryReview;
  const step = attempt && loop.plan.steps.find((candidate) => candidate.id === attempt.stepId);
  if (!run || !attempt || !review || !step) return undefined;
  const requirement = receiptRequirement(loop, step);
  if (!requirement || !review.delivery || deliveryKey(requirement) !== deliveryKey(review.delivery)
    || review.completion.receipt?.destination !== requirement.destination) return undefined;
  const candidate: StepOutcome = { status: 'succeeded', summary: review.completion.reason, completion: review.completion };
  const outcome = await applyDeliveryContract(host, loop, step, candidate);
  let result: OrchestratorActionResult | undefined;
  await host.updateState((state) => {
    const current = state.loops.find((entry) => entry.id === loop.id);
    if (!current || !sameReconciliationContext(loop, current)) {
      result = { ok: false, error: 'Workflow changed during delivery verification. Review its current state before retrying.', loop: current };
      return state;
    }
    if (outcome.completion?.status !== 'complete') return state;
    const now = host.now();
    const currentRun = current.runs.at(-1)!;
    const currentAttempt = currentRun.stepAttempts.find((entry) => entry.id === attempt.id)!;
    const recorded = { ...currentAttempt, outcome };
    const applied = applyStepOutcome(current, step.id, recorded, outcome, now);
    const completed = recordCompletion(host, applied, step.id, recorded, outcome);
    let reconciled: typeof run = {
      ...currentRun, status: 'completed', completionSignal: completed.signal, block: undefined,
      stepAttempts: currentRun.stepAttempts.map((entry) => entry.id === attempt.id ? recorded : entry),
    };
    if (attempt.activationId) reconciled = settleActivation(reconciled, attempt.activationId, outcome, now);
    const next: Loop = {
      ...completed.loop,
      status: completed.loop.status === 'blocked' ? 'active' : completed.loop.status,
      runtime: { ...completed.loop.runtime, block: undefined, pendingInput: undefined },
      runs: current.runs.map((entry) => entry.id === run.id ? reconciled : entry),
    };
    result = { ok: true, loop: next, run: reconciled };
    return { ...state, loops: state.loops.map((entry) => entry.id === loop.id ? next : entry) };
  });
  if (!result?.ok) return result;
  host.notify('Existing delivery verified. No delivery was repeated.', 'info');
  return result;
}

function deliveryKey(delivery: NonNullable<Loop['delivery']>): string {
  return JSON.stringify([delivery.destination, Object.entries(delivery.params ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}

/** Compare authority and delivery state inside the serialized store update. */
export function sameReconciliationContext(before: Loop, current: Loop): boolean {
  const context = (loop: Loop) => ({
    status: loop.status, plan: loop.plan, delivery: deliveryKey(effectiveDelivery(loop)),
    activeRunId: loop.runtime.activeRunId, workspace: loop.runtime.workspace,
    pendingInput: loop.runtime.pendingInput, block: loop.runtime.block, completion: loop.runtime.completion,
    stepStates: loop.runtime.stepStates, answeredInputs: loop.answeredInputs, triggers: loop.triggers,
    run: loop.runs.at(-1),
  });
  return JSON.stringify(context(before)) === JSON.stringify(context(current));
}
