/**
 * Pure run-engine helpers, split out of run-engine.ts (500-LOC limit).
 */

import type { Loop, LoopRun } from '../shared/types';
import type { OrchestratorHost } from './host';

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

/**
 * A loop leaving 'active' can never drain a stashed pendingEvent — drop it
 * VISIBLY (an `event-dropped` warning) instead of leaving a stale fire to go
 * off on a later re-activation. No-op while the loop stays active.
 */
export function dropStrandedEvent(host: OrchestratorHost, loop: Loop): Loop {
  const dropped = loop.status !== 'active' ? loop.runtime.pendingEvent : undefined;
  if (!dropped) return loop;
  return {
    ...loop,
    warnings: [
      ...loop.warnings,
      {
        id: host.newId('warning'),
        code: 'event-dropped',
        message: `A "${dropped.source}" event arrived during the final run and was not processed because the loop is now ${loop.status}.`,
        createdAt: host.now(),
      },
    ],
    runtime: { ...loop.runtime, pendingEvent: undefined },
  };
}
