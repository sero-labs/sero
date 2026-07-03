/**
 * Applies a StepOutcome to loop runtime state and detects planned completion.
 *
 * `status` on a StepAttempt is mechanical; `outcome` is the LLM-reported or
 * LLM-evaluated logical result. A loop completes ONLY when a step outcome
 * includes `completion.status === "complete"` (D-03).
 */

import type {
  CompletionSignal,
  Loop,
  StepAttempt,
  StepCompletion,
  StepOutcome,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { isExternalDestination } from '../shared/delivery-types';
import { consumeApproval } from './delivery/delivery-contract';
import { finalizationStepId } from './readiness';
import { isRecurring } from './scheduler';

/** Maps a step outcome status to the matching step runtime status. */
function outcomeToStepStatus(status: StepOutcome['status']): StepRuntimeState['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'skipped':
      return 'skipped';
    case 'needs-revision':
      return 'needs-revision';
  }
}

/**
 * Merges a step's emitted variables into the loop's. Keys are shallow-merged so
 * later steps see facts earlier ones recorded; the reserved `notes` key instead
 * ACCUMULATES (append) so it forms a running shared scratchpad across steps.
 */
export function mergeVariables(
  existing: Record<string, unknown>,
  incoming?: Record<string, unknown>,
): Record<string, unknown> {
  if (!incoming) return existing;
  const merged = { ...existing, ...incoming };
  const prevNotes = typeof existing.notes === 'string' ? existing.notes.trim() : '';
  const addNotes = typeof incoming.notes === 'string' ? incoming.notes.trim() : '';
  const notes = [prevNotes, addNotes].filter(Boolean).join('\n');
  if (notes) merged.notes = notes;
  else delete merged.notes;
  return merged;
}

/** Records the outcome on the step state and merges any variables (notes accumulate). */
export function applyStepOutcome(
  loop: Loop,
  stepId: string,
  attempt: StepAttempt,
  outcome: StepOutcome,
  now: string,
): Loop {
  const prev = loop.runtime.stepStates[stepId];
  const stepStates = {
    ...loop.runtime.stepStates,
    [stepId]: {
      ...prev,
      status: outcomeToStepStatus(outcome.status),
      lastAttemptId: attempt.id,
      outcome,
      updatedAt: now,
    },
  };
  const variables = mergeVariables(loop.runtime.variables, outcome.variables);
  return { ...loop, runtime: { ...loop.runtime, stepStates, variables }, updatedAt: now };
}

/**
 * Whether a step's completion signal should end the loop. A `complete` signal is
 * terminal ONLY from the finalization step (the single sink): a non-final step
 * that slips one in is ignored, so the planned finalization/summary step still
 * runs (the model sometimes declares the loop done a step early). A `blocked`
 * signal is honored from any step — a step that genuinely cannot proceed should
 * stop the loop. With no single sink, fall back to accepting it anywhere so the
 * loop can still end.
 */
export function acceptsCompletion(
  host: OrchestratorHost,
  loop: Loop,
  stepId: string,
  completion: StepCompletion,
): boolean {
  if (completion.status === 'blocked') return true;
  const finalId = finalizationStepId(loop);
  if (finalId === undefined || finalId === stepId) return true;
  host.log(`Loop ${loop.id}: ignored an early completion from non-final step "${stepId}" — deferring to "${finalId}".`);
  return false;
}

export interface CompletionResult {
  loop: Loop;
  signal: CompletionSignal;
}

/**
 * Records a completion signal emitted by a planned step outcome.
 *
 * For a one-shot loop (or a recurring loop's `final` success, or a planned
 * block) this is terminal: the loop moves to `complete`/`blocked`. For a
 * recurring loop's ordinary `complete`, the iteration is simply done — the loop
 * stays `active` and scheduled, and the next fire runs it again.
 */
/** Newest receipts kept on runtime.deliveries (they also live in run history). */
const MAX_DELIVERIES = 20;

export function recordCompletion(
  host: OrchestratorHost,
  loop: Loop,
  stepId: string,
  attempt: StepAttempt,
  outcome: StepOutcome,
): CompletionResult {
  const completion = outcome.completion!;
  const now = host.now();
  const final = completion.final === true;
  const signal: CompletionSignal = {
    status: completion.status,
    final,
    sourceStepId: stepId,
    sourceAttemptId: attempt.id,
    reason: completion.reason,
    receipt: completion.receipt,
    createdAt: now,
    modelResponsePath: attempt.outputPath,
  };

  // An accepted receipt APPENDS to the loop's delivery history (unlike the
  // per-run PR inventory, which is replaced) so future runs see what already
  // shipped; capped so the loop file stays bounded.
  const receipt = completion.status === 'complete' ? completion.receipt : undefined;
  const deliveries = receipt ? [...(loop.runtime.deliveries ?? []), receipt].slice(-MAX_DELIVERIES) : loop.runtime.deliveries;
  // An external send uses up the ONE approval token the receipt named.
  const answeredInputs =
    receipt && isExternalDestination(receipt.destination) ? consumeApproval(loop.answeredInputs, receipt.approvalId, now) : loop.answeredInputs;
  loop = { ...loop, answeredInputs };

  // Recurring iteration that completed and is not a declared final success:
  // record the run's signal but keep the loop active and scheduled.
  if (completion.status === 'complete' && !final && isRecurring(loop)) {
    return { loop: { ...loop, runtime: { ...loop.runtime, deliveries }, updatedAt: now }, signal };
  }

  const terminalComplete = completion.status === 'complete';
  // A loop completing for good (final success or a one-off) stops its triggers
  // too: disable cron/hybrid/event triggers so nothing fires it again.
  const triggers = terminalComplete
    ? loop.triggers.map((t) => (t.type === 'manual' ? t : { ...t, disabled: true, nextFireAt: undefined }))
    : loop.triggers;
  const block =
    completion.status === 'blocked'
      ? { kind: 'planned-block' as const, reason: completion.reason, createdAt: now, sourceStepId: stepId, sourceAttemptId: attempt.id }
      : undefined;
  // A pendingEvent stashed mid-run lives on DISK, not on this in-memory copy —
  // the engine's commit() drops it (with an `event-dropped` warning) when the
  // loop leaves 'active', so nothing stale fires on a later re-activation.
  return {
    loop: {
      ...loop,
      status: terminalComplete ? 'complete' : 'blocked',
      triggers,
      runtime: { ...loop.runtime, completion: signal, block, deliveries },
      updatedAt: now,
    },
    signal,
  };
}
