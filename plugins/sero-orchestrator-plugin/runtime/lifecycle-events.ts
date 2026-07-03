/**
 * Internal `loop:*` event emission (Living Loops, spec 12). The coordinator
 * emits these at its own lifecycle points — no adapter involved, pure push:
 *
 * - `loop:completed`  — a run finalized with a completed status;
 * - `loop:blocked`    — a run finalized blocked;
 * - `loop:asked-question` — a human-input request was raised (step question
 *   during a run, or planner clarification at create).
 *
 * Chain depth: a run fired by a `loop:*` event carries that event's depth on
 * `run.firedBy.chainDepth`; the events IT emits carry depth + 1, so loop→loop
 * chains terminate at the coordinator's cap. Runs not fired by a loop event
 * emit at depth 0.
 */

import type { Loop, LoopRun, OrchestratorEvent } from '../shared/types';
import type { OrchestratorHost } from './host';

function nextChainDepth(run?: LoopRun): number {
  return run?.firedBy?.chainDepth !== undefined ? run.firedBy.chainDepth + 1 : 0;
}

function baseEvent(host: OrchestratorHost, loop: Loop, run?: LoopRun): Omit<OrchestratorEvent, 'source' | 'summary' | 'payload'> {
  return {
    id: host.newId('evt'),
    occurredAt: host.now(),
    sourceLoopId: loop.id,
    chainDepth: nextChainDepth(run),
  };
}

/**
 * The lifecycle events one coordinator action produced, compared against the
 * loop's state when the action started. `before` is undefined at create.
 */
export function buildLifecycleEvents(
  host: OrchestratorHost,
  before: Loop | undefined,
  after: Loop | undefined,
  run?: LoopRun,
): OrchestratorEvent[] {
  if (!after) return [];
  const events: OrchestratorEvent[] = [];

  const question = after.runtime.pendingInput;
  if (question && !before?.runtime.pendingInput) {
    events.push({
      ...baseEvent(host, after, run),
      source: 'loop:asked-question',
      summary: `Loop "${after.title}" asked: ${question.questions[0]?.prompt ?? ''}`,
      payload: {
        loopId: after.id,
        title: after.title,
        stepId: question.stepId,
        questions: question.questions.map((q) => q.prompt),
      },
    });
  }

  if (run?.status === 'completed') {
    events.push({
      ...baseEvent(host, after, run),
      source: 'loop:completed',
      summary: `Loop "${after.title}" completed run ${run.runNumber}`,
      payload: {
        loopId: after.id,
        title: after.title,
        runNumber: run.runNumber,
        reason: run.completionSignal?.reason ?? '',
      },
    });
  } else if (run?.status === 'blocked') {
    events.push({
      ...baseEvent(host, after, run),
      source: 'loop:blocked',
      summary: `Loop "${after.title}" blocked on run ${run.runNumber}`,
      payload: {
        loopId: after.id,
        title: after.title,
        runNumber: run.runNumber,
        reason: run.block?.reason ?? after.runtime.block?.reason ?? '',
      },
    });
  }

  return events;
}
