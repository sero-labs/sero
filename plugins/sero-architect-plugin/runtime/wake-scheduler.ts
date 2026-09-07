/**
 * One wake at a time per project, highest priority first, and wakes of the
 * same kind that arrive during a turn become one wake. Nothing here polls: a
 * wake is requested by the code that observed the event.
 */

import { enqueueWake, nextWake, type WakeEvent } from '../shared/wake';
import type { WakeGate } from './wake-gate';

export interface WakeSchedulerDeps {
  gate: WakeGate;
  /** Delivers one wake: opens the session, sends the contract, runs the turn. */
  deliver(projectId: string, wake: WakeEvent): Promise<void>;
  log(message: string): void;
}

export interface WakeScheduler {
  request(projectId: string, wake: WakeEvent): void;
  isRunning(projectId: string): boolean;
  /** Queued wakes for a project, for tests and the status line. */
  pending(projectId: string): WakeEvent[];
  /** Resolves once every queued wake has been delivered. */
  idle(projectId: string): Promise<void>;
  /** Drops a project's queue; a running turn finishes on its own. */
  forget(projectId: string): void;
}

interface ProjectQueue {
  queue: WakeEvent[];
  running: Promise<void> | null;
}

export function createWakeScheduler(deps: WakeSchedulerDeps): WakeScheduler {
  const projects = new Map<string, ProjectQueue>();

  const entry = (projectId: string): ProjectQueue => {
    const existing = projects.get(projectId);
    if (existing) return existing;
    const created: ProjectQueue = { queue: [], running: null };
    projects.set(projectId, created);
    return created;
  };

  const drain = async (projectId: string): Promise<void> => {
    const state = entry(projectId);
    await deps.gate.whenOpen();
    for (;;) {
      const wake = nextWake(state.queue);
      if (!wake) return;
      state.queue = state.queue.filter((queued) => queued !== wake);
      try {
        await deps.deliver(projectId, wake);
      } catch (error) {
        deps.log(`wake ${wake.kind} for ${projectId} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  return {
    request(projectId, wake) {
      const state = entry(projectId);
      state.queue = enqueueWake(state.queue, wake);
      if (state.running) return;
      state.running = drain(projectId).finally(() => { state.running = null; });
    },
    isRunning: (projectId) => entry(projectId).running !== null,
    pending: (projectId) => [...entry(projectId).queue],
    idle: async (projectId) => { await entry(projectId).running; },
    forget: (projectId) => { entry(projectId).queue = []; },
  };
}
