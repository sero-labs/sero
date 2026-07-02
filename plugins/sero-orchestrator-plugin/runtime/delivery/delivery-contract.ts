/**
 * Delivery-receipt contract (spec 13) — the no-hollow-delivery layer, mirroring
 * route-contract.ts. A loop that declares a destination completes ONLY with a
 * structurally valid DeliveryReceipt; a completion claim without one downgrades
 * to needs-revision so normal recovery handles it. Defence in depth:
 *
 *  1. the final-step task prompt demands the receipt (formatDeliveryContract),
 *  2. the executor's in-session repair re-prompts when it is missing/invalid
 *     (deliveryProblems via outcomeRepair), and
 *  3. the engine backstop refuses the completion (enforceDeliveryContract),
 *     plus an async verify-back where a read API is free (verify-receipt.ts).
 *
 * Everything here is pure (no host) so it unit-tests directly.
 */

import type { AnsweredInput, Loop, LoopStepDefinition, StepOutcome } from '../../shared/types';
import type { DeliveryReceipt, LoopDeliverySettings } from '../../shared/delivery-types';
import { effectiveDelivery, isExternalDestination } from '../../shared/delivery-types';
import { finalizationStepId } from '../readiness';
import { deliverySpec } from './registry';

/**
 * The delivery this step must prove when it claims completion: the loop's
 * effective delivery for the finalization step of a loop whose destination
 * isn't workspace-files; undefined otherwise (no receipt required). A
 * guard-skipped final step never reports an outcome, so it is exempt naturally.
 */
export function receiptRequirement(loop: Loop, step: LoopStepDefinition): LoopDeliverySettings | undefined {
  if (finalizationStepId(loop) !== step.id) return undefined;
  const delivery = effectiveDelivery(loop);
  return delivery.destination === 'workspace-files' ? undefined : delivery;
}

/**
 * True when this answered input is an OPEN approval: an `approval` question
 * answered with its `approve` choice, not yet consumed by a delivered receipt.
 * Structured check only (`choiceId === 'approve'`) — never a text guess.
 */
function isOpenApproval(answered: AnsweredInput): boolean {
  if (answered.consumedAt) return false;
  return answered.questions.some(
    (q) => q.kind === 'approval' && answered.answers.some((a) => a.questionId === q.id && a.choiceId === 'approve'),
  );
}

/** True when the loop holds an approval that no earlier send has consumed. */
export function hasOpenApproval(loop: Loop): boolean {
  return (loop.answeredInputs ?? []).some(isOpenApproval);
}

/**
 * Marks every open approval consumed (called when an external receipt is
 * accepted): one user approval authorizes exactly one send, so a stale
 * approval can never cover a later, unapproved delivery.
 */
export function consumeApprovals(answeredInputs: AnsweredInput[] | undefined, now: string): AnsweredInput[] | undefined {
  if (!answeredInputs?.some(isOpenApproval)) return answeredInputs;
  return answeredInputs.map((a) => (isOpenApproval(a) ? { ...a, consumedAt: now } : a));
}

/**
 * Why this outcome's completion claim fails the delivery contract (empty when
 * it passes, or when nothing is claimed). Format checks only — the receipt
 * content is the model's; code never judges whether the delivery was "good".
 * For external destinations the claim additionally needs an open user approval
 * on the loop (FR-D4): the agent cannot talk its way past a missing one.
 */
export function deliveryProblems(loop: Loop, delivery: LoopDeliverySettings, outcome: StepOutcome): string[] {
  if (outcome.completion?.status !== 'complete') return [];
  const receipt = outcome.completion.receipt;
  if (!receipt) return ['the completion has no "receipt" — completion without proof of delivery is not accepted'];
  const problems: string[] = [];
  if (receipt.destination !== delivery.destination) {
    problems.push(`the receipt "destination" is "${receipt.destination}" but this loop's declared destination is "${delivery.destination}"`);
  }
  if (!receipt.ref.trim()) problems.push('the receipt "ref" is empty — it must point at what actually landed');
  if (!receipt.summary.trim()) problems.push('the receipt "summary" is empty');
  if (Number.isNaN(Date.parse(receipt.deliveredAt))) {
    problems.push(`the receipt "deliveredAt" ("${receipt.deliveredAt}") is not a valid timestamp`);
  }
  if (isExternalDestination(delivery.destination) && !hasOpenApproval(loop)) {
    problems.push(
      `"${delivery.destination}" is externally visible and requires the user's approval before delivery — no un-used approval is recorded on this loop. Present the content as an "approval" question (the gate step) and wait for the user`,
    );
  }
  return problems;
}

/** Downgrades an outcome whose completion claim failed the contract; used by the backstop and verify-back. */
export function downgradeDelivery(delivery: LoopDeliverySettings, outcome: StepOutcome, problems: string[]): StepOutcome {
  return {
    status: 'needs-revision',
    summary: `Claimed completion without valid proof of delivery to "${delivery.destination}": ${problems.join('; ')}. Deliver first, then complete with the real receipt.`,
    variables: outcome.variables,
  };
}

/**
 * Backstop (layer 3): a completion claim on the finalization step of a
 * destination-declaring loop is refused — downgraded to needs-revision, losing
 * its completion — unless it carries a structurally valid receipt.
 */
export function enforceDeliveryContract(loop: Loop, step: LoopStepDefinition, outcome: StepOutcome): StepOutcome {
  const requirement = receiptRequirement(loop, step);
  if (!requirement) return outcome;
  const problems = deliveryProblems(loop, requirement, outcome);
  return problems.length === 0 ? outcome : downgradeDelivery(requirement, outcome, problems);
}

/**
 * The final-step receipt contract (layer 1): how the step must prove delivery
 * inside its completion signal. Empty for workspace-files — results staying in
 * the tree need no receipt.
 */
export function formatDeliveryContract(delivery: LoopDeliverySettings): string {
  if (delivery.destination === 'workspace-files') return '';
  const spec = deliverySpec(delivery.destination);
  return `\nThis loop's declared delivery destination is "${spec.id}" (${spec.label}). Completion requires PROOF OF DELIVERY: when you emit the completion signal, the "completion" object MUST also carry a "receipt":
"completion": { "status": "complete", "reason": ..., "receipt": { "destination": "${spec.id}", "ref": "<${spec.receiptHint}>", "summary": "one sentence on what was delivered", "deliveredAt": "<ISO 8601 timestamp>" } }
The "ref" must be the REAL value from the delivery step's actual result — never invent or approximate it. If nothing was actually delivered, do not claim completion; report the true status instead.`;
}

/** In-session repair turn (layer 2) when a completion claim failed the delivery contract. */
export function formatDeliveryRepair(delivery: LoopDeliverySettings, problems: string[]): string {
  const receipt: DeliveryReceipt = {
    destination: delivery.destination,
    ref: `<${deliverySpec(delivery.destination).receiptHint}>`,
    summary: '<one sentence on what was delivered>',
    deliveredAt: '<ISO 8601 timestamp>',
  };
  return [
    `You claimed the loop is complete, but this loop delivers to "${delivery.destination}" and completion without valid proof of delivery is not accepted:`,
    problems.map((p) => `- ${p}`).join('\n'),
    `\nIf the delivery really happened, add the receipt to your completion using the REAL values from the delivery result:\n"completion": { "status": "complete", "reason": ..., "receipt": ${JSON.stringify(receipt)} }`,
    'If it did NOT happen, do not claim completion — report your true "status" instead.',
    '\nDo NOT redo the work or run more tools. Reply with ONLY the corrected StepOutcome JSON in a ```json fence, and nothing after it.',
  ].join('\n');
}
