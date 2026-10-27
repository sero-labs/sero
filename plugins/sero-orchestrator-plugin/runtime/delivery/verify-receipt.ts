import type { Loop, LoopStepDefinition, StepOutcome } from '../../shared/types';
import type { DeliveryReceipt } from '../../shared/delivery-types';
import type { OrchestratorHost } from '../host';
import { enforceDeliveryContract, receiptRequirement } from './delivery-contract';
import { observeReceipt, type VerifyResult } from './receipt-observation';

export type { VerifyResult } from './receipt-observation';

export async function verifyReceipt(host: OrchestratorHost, loop: Loop, receipt: DeliveryReceipt): Promise<VerifyResult> {
  if (receipt.destination !== 'pr' && receipt.destination !== 'saved-artifact') return { ok: true };
  if (!receipt.runId || receipt.planRevision === undefined || !receipt.revision) {
    return { ok: false, status: 'unknown', reason: 'This receipt has no invocation/revision binding. Review the existing result and recover its delivery evidence before repeating work.' };
  }
  const run = loop.runs.find((candidate) => candidate.id === (loop.runtime.activeRunId ?? loop.runs.at(-1)?.id));
  if (!run || receipt.runId !== run.id || receipt.planRevision !== loop.plan.revision || Date.parse(receipt.deliveredAt) < Date.parse(run.startedAt)) {
    return { ok: false, status: 'mismatch', reason: 'This receipt belongs to an older invocation or plan. It cannot close the current request.' };
  }
  if (!/^[a-f0-9]+$/i.test(receipt.revision) || receipt.revision.length !== (receipt.destination === 'pr' ? 40 : 64)) {
    return { ok: false, status: 'unknown', reason: 'The receipt has no usable delivered revision. Recover the Git commit SHA or artifact SHA-256 before retrying.' };
  }
  return observeReceipt(host, loop, receipt);
}

/** Failed observation retains the reachable result, but never completes the request. */
export async function applyDeliveryContract(host: OrchestratorHost, loop: Loop, step: LoopStepDefinition, outcome: StepOutcome): Promise<StepOutcome> {
  const enforced = enforceDeliveryContract(loop, step, outcome);
  if (enforced !== outcome) {
    if (!outcome.completion?.receipt) return enforced;
    return { ...enforced, summary: `${enforced.summary} Review the existing result before repeating delivery.`,
      deliveryReview: { status: 'mismatch', reason: enforced.summary, completion: outcome.completion } };
  }
  const requirement = receiptRequirement(loop, step);
  const completion = outcome.completion;
  const receipt = completion?.status === 'complete' ? completion.receipt : undefined;
  if (!requirement || !receipt || !completion) return outcome;
  const verified = await verifyReceipt(host, loop, receipt);
  if (verified.ok) {
    if (receipt.destination !== 'pr' && receipt.destination !== 'saved-artifact') return outcome;
    return { ...outcome, completion: { ...completion, receipt: { ...receipt, verifiedAt: host.now() } } };
  }
  host.log(`Loop ${loop.id}: delivery receipt ${verified.status} — ${verified.reason}`);
  return {
    status: 'needs-revision', variables: outcome.variables,
    summary: `Delivery ${verified.status}: ${verified.reason} Existing result: ${receipt.ref}. Review the destination before retrying delivery.`,
    deliveryReview: { status: verified.status, reason: verified.reason, completion },
  };
}
