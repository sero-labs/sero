/**
 * Restart recovery (D-08, FR-23). Subagent tracker state is in memory, so on
 * workspace runtime start Orchestrator reconciles persisted in-flight state
 * before scheduling new work:
 *
 *  - mark the active run `orphaned`;
 *  - mark persisted `running` attempts in that run `orphaned`;
 *  - move the affected step states to `failed`;
 *  - clear `runtime.activeRunId`;
 *  - record a system observation explaining the restart.
 *
 * The loop stays active so the next coordinator run routes the failed steps
 * through normal recovery.
 */

import type { Loop, Observation } from '../shared/types';
import type { OrchestratorHost } from './host';

/** Reconciles a single loop. Returns the loop unchanged when nothing is in flight. */
export function reconcileLoop(host: OrchestratorHost, loop: Loop): Loop {
  const activeRunId = loop.runtime.activeRunId;
  if (!activeRunId) return loop;

  const now = host.now();
  const runIndex = loop.runs.findIndex((r) => r.id === activeRunId);
  const orphanedStepIds = new Set<string>();

  const runs = loop.runs.map((run) => {
    if (run.id !== activeRunId) return run;
    const stepAttempts = run.stepAttempts.map((attempt) => {
      if (attempt.status !== 'running') return attempt;
      orphanedStepIds.add(attempt.stepId);
      return { ...attempt, status: 'orphaned' as const, endedAt: now, error: attempt.error ?? 'process restarted' };
    });
    return { ...run, status: 'orphaned' as const, endedAt: run.endedAt ?? now, stepAttempts };
  });

  const stepStates = { ...loop.runtime.stepStates };
  for (const stepId of orphanedStepIds) {
    const prev = stepStates[stepId];
    if (prev) stepStates[stepId] = { ...prev, status: 'failed', updatedAt: now };
  }

  const observation: Observation = {
    id: host.newId('obs'),
    source: 'system',
    summary:
      runIndex === -1
        ? `Active run ${activeRunId} was not observable after restart; cleared.`
        : `Process restarted: run ${activeRunId} and ${orphanedStepIds.size} attempt(s) marked orphaned.`,
    createdAt: now,
  };

  const reconciledRuns =
    runIndex === -1
      ? runs
      : runs.map((run, i) => (i === runIndex ? { ...run, observations: [...run.observations, observation] } : run));

  return {
    ...loop,
    runs: reconciledRuns,
    runtime: { ...loop.runtime, activeRunId: undefined, stepStates },
    updatedAt: now,
  };
}

/** Reconciles every loop in the workspace state. */
export async function reconcileAll(host: OrchestratorHost): Promise<void> {
  await host.updateState((state) => ({
    ...state,
    loops: state.loops.map((loop) => reconcileLoop(host, loop)),
  }));
}
