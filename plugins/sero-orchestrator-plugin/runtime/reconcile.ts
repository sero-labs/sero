/**
 * Restart recovery (D-08, FR-23). Subagent tracker state is in memory, so on
 * workspace runtime start Orchestrator reconciles persisted in-flight state
 * before scheduling new work:
 *
 *  - mark the active (and any stale 'running') run `orphaned`;
 *  - mark persisted `running` attempts in the active run `orphaned`;
 *  - clear `runtime.activeRunId`;
 *  - reset every step left mid-flight ('running'/'ready') — a recurring loop is
 *    RE-ARMED for a clean next pass, a one-off loop's steps are marked `failed`;
 *  - record a system observation explaining the restart.
 *
 * Resetting by step STATE (not just recorded attempts) is essential: a step that
 * was executing when the process died was never saved as a `running` attempt
 * (attempts are recorded only when a step finishes), so its runtime state is left
 * stuck at `running`, which silently wedges the loop (no step is ever ready).
 */

import type { Loop, Observation, StepRuntimeState } from '../shared/types';
import type { OrchestratorHost } from './host';
import { isRecurring, rearmLoop } from './scheduler';
import { orphanRunningActivations } from './activations';

const inFlight = (state: StepRuntimeState): boolean =>
  state.status === 'running' || state.status === 'ready';

/** Reconciles a single loop. Returns it unchanged when nothing was in flight. */
export function reconcileLoop(host: OrchestratorHost, loop: Loop): Loop {
  // Tolerate loops persisted by an incompatible/older schema (no runtime field).
  if (!loop.runtime) return loop;
  const activeRunId = loop.runtime.activeRunId;
  const hasStuckStep = Object.values(loop.runtime.stepStates).some(inFlight);
  if (!activeRunId && !hasStuckStep) return loop;

  const now = host.now();
  const runIndex = activeRunId ? loop.runs.findIndex((r) => r.id === activeRunId) : -1;

  const runs = loop.runs.map((run) => {
    if (run.id === activeRunId) {
      const stepAttempts = run.stepAttempts.map((attempt) =>
        attempt.status === 'running'
          ? { ...attempt, status: 'orphaned' as const, endedAt: now, error: attempt.error ?? 'process restarted' }
          : attempt,
      );
      return orphanRunningActivations({ ...run, status: 'orphaned' as const, endedAt: run.endedAt ?? now, stepAttempts }, now, 'orphaned');
    }
    // A non-active run still marked 'running' is a stale zombie from a prior run.
    if (run.status === 'running') return { ...run, status: 'orphaned' as const, endedAt: run.endedAt ?? now };
    return run;
  });

  const observation: Observation = {
    id: host.newId('obs'),
    source: 'system',
    summary: activeRunId
      ? `Process restarted: run ${activeRunId} marked orphaned; in-flight steps reset.`
      : 'Process restarted: steps left in flight by a previous run were reset.',
    createdAt: now,
  };
  const reconciledRuns =
    runIndex === -1
      ? runs
      : runs.map((run, i) => (i === runIndex ? { ...run, observations: [...run.observations, observation] } : run));

  const base = { ...loop, runs: reconciledRuns };

  // A recurring loop's interrupted iteration is disposable — re-arm for a clean
  // next pass (this also clears the steps the dead run left stuck in 'running').
  if (isRecurring(loop)) return rearmLoop(base, now);

  // One-off loop: mark steps left mid-flight as failed so the loop surfaces as
  // needing attention rather than silently wedged.
  const stepStates = { ...loop.runtime.stepStates };
  for (const [id, state] of Object.entries(stepStates)) {
    if (inFlight(state)) stepStates[id] = { ...state, status: 'failed', updatedAt: now };
  }
  return { ...base, runtime: { ...loop.runtime, activeRunId: undefined, stepStates }, updatedAt: now };
}

/** Reconciles every loop in the workspace state. */
export async function reconcileAll(host: OrchestratorHost): Promise<void> {
  await host.updateState((state) => ({
    ...state,
    loops: state.loops.map((loop) => reconcileLoop(host, loop)),
  }));
}
