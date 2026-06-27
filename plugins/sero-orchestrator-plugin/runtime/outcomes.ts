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
  StepOutcome,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';
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
    createdAt: now,
    modelResponsePath: attempt.outputPath,
  };

  // Recurring iteration that completed and is not a declared final success:
  // record the run's signal but keep the loop active and scheduled.
  if (completion.status === 'complete' && !final && isRecurring(loop)) {
    return { loop: { ...loop, updatedAt: now }, signal };
  }

  const terminalComplete = completion.status === 'complete';
  // A loop completing for good (final success or a one-off) stops its schedule
  // too: disable cron/hybrid triggers so it does not fire again.
  const triggers = terminalComplete
    ? loop.triggers.map((t) =>
        t.type === 'cron' || t.type === 'hybrid' ? { ...t, disabled: true, nextFireAt: undefined } : t,
      )
    : loop.triggers;
  const block =
    completion.status === 'blocked'
      ? { kind: 'planned-block' as const, reason: completion.reason, createdAt: now, sourceStepId: stepId, sourceAttemptId: attempt.id }
      : undefined;
  return {
    loop: {
      ...loop,
      status: terminalComplete ? 'complete' : 'blocked',
      triggers,
      runtime: { ...loop.runtime, completion: signal, block },
      updatedAt: now,
    },
    signal,
  };
}
