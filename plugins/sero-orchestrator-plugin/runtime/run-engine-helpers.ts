/**
 * Pure run-engine helpers, split out of run-engine.ts (500-LOC limit).
 */

import type { Loop, LoopBlock, LoopRun } from '../shared/types';
import type { OrchestratorHost } from './host';

/** Blocks the loop on an invalid runtime state. */
export function blockRuntime(loop: Loop, reason: string, now: string): Loop {
  return { ...loop, status: 'blocked', runtime: { ...loop.runtime, block: { kind: 'runtime-error', reason, createdAt: now } }, updatedAt: now };
}

/** Blocks the loop on a tripped management limit. */
export function blockLimit(loop: Loop, limit: LoopBlock['limit'], reason: string, now: string): Loop {
  return { ...loop, status: 'blocked', runtime: { ...loop.runtime, block: { kind: 'management-limit', reason, createdAt: now, limit } }, updatedAt: now };
}

/**
 * Resets a step to pending (clearing its outcome) when it asks the user. The
 * attempt count is reset too: asking is a deliberate pause, not a failed work
 * attempt, so the step keeps a full budget for its re-run after the answer.
 */
export function resetStepPending(loop: Loop, stepId: string, now: string): Loop {
  const prev = loop.runtime.stepStates[stepId];
  if (!prev) return loop;
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      stepStates: { ...loop.runtime.stepStates, [stepId]: { ...prev, status: 'pending', outcome: undefined, attempts: 0, updatedAt: now } },
    },
  };
}

/** Resets every `running` step back to `pending` (used when a run is cancelled). */
export function resetRunningSteps(
  stepStates: Loop['runtime']['stepStates'],
  now: string,
): Loop['runtime']['stepStates'] {
  let changed = false;
  const next: Loop['runtime']['stepStates'] = {};
  for (const [id, state] of Object.entries(stepStates)) {
    if (state.status === 'running') {
      next[id] = { ...state, status: 'pending', updatedAt: now };
      changed = true;
    } else {
      next[id] = state;
    }
  }
  return changed ? next : stepStates;
}

export function replaceRun(runs: LoopRun[], run: LoopRun): LoopRun[] {
  const index = runs.findIndex((r) => r.id === run.id);
  if (index === -1) return [...runs, run];
  const next = [...runs];
  next[index] = run;
  return next;
}

/**
 * Per-trigger merge for engine commits: the on-disk trigger is authoritative
 * (it carries fire counters the coordinator bumped concurrently); the engine's
 * only legitimate trigger write — disabling the schedule on terminal completion
 * (outcomes.ts) — is applied on top.
 */
export function mergeTriggers(disk: Loop['triggers'], memory: Loop['triggers']): Loop['triggers'] {
  const memoryById = new Map(memory.map((t) => [t.id, t]));
  return disk.map((trigger) => {
    const engineCopy = memoryById.get(trigger.id);
    if (engineCopy?.disabled && !trigger.disabled) {
      return { ...trigger, disabled: true, nextFireAt: engineCopy.nextFireAt };
    }
    return trigger;
  });
}

/** True when this batch is about to start background filesystem work with no workspace resolved yet. */
export function needsWorkspace(loop: Loop, batch: string[]): boolean {
  if (loop.runtime.workspace.resolved) return false;
  return batch.some((id) => loop.plan.steps.find((step) => step.id === id)?.execution.type === 'background-agent');
}

/**
 * A loop leaving 'active' can never drain its pending-event queue — drop it
 * VISIBLY (an `event-dropped` warning) instead of leaving stale fires to go
 * off on a later re-activation. No-op while the loop stays active.
 */
export function dropStrandedEvent(host: OrchestratorHost, loop: Loop): Loop {
  const stranded = loop.status !== 'active' ? (loop.runtime.pendingEvents ?? []) : [];
  if (stranded.length === 0) return loop;
  const sources = [...new Set(stranded.map((e) => e.source))].join(', ');
  const count = stranded.length === 1 ? 'An event' : `${stranded.length} queued events`;
  return {
    ...loop,
    warnings: [
      ...loop.warnings,
      {
        id: host.newId('warning'),
        code: 'event-dropped',
        message: `${count} ("${sources}") arrived during the final run and ${stranded.length === 1 ? 'was' : 'were'} not processed because the loop is now ${loop.status}.`,
        createdAt: host.now(),
      },
    ],
    runtime: { ...loop.runtime, pendingEvents: undefined },
  };
}
