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
 * executed by an older runtime might not have a persisted `running` attempt,
 * so its runtime state can be left
 * stuck at `running`, which silently wedges the loop (no step is ever ready).
 */

import type { Loop, LoopBlock, Observation, StepRuntimeState } from '../shared/types';
import type { OrchestratorHost } from './host';
import { isRecurring, rearmLoop } from './scheduler';
import { orphanRunningActivations } from './activations';
import { uncertainExternalDeliveryInRun } from './delivery/delivery-contract';

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
  const interruptedRunIds = new Set(loop.runs.filter((run) => run.id === activeRunId || run.status === 'running').map((run) => run.id));

  const runs = loop.runs.map((run) => {
    // Mark the active run and any stale running zombie as orphaned. The latter
    // can retain a running attempt even when activeRunId was already cleared.
    if (run.id === activeRunId || run.status === 'running') {
      const stepAttempts = run.stepAttempts.map((attempt) =>
        attempt.status === 'running'
          ? { ...attempt, status: 'orphaned' as const, endedAt: now, error: attempt.error ?? 'process restarted' }
          : attempt,
      );
      return orphanRunningActivations({ ...run, status: 'orphaned' as const, endedAt: run.endedAt ?? now, stepAttempts }, now, 'orphaned');
    }
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

  const uncertainEntry = reconciledRuns
    .filter((run) => interruptedRunIds.has(run.id))
    .map((run) => ({ run, uncertain: uncertainExternalDeliveryInRun(loop, run) }))
    .find((entry) => entry.uncertain);
  const uncertainRun = uncertainEntry?.run;
  const uncertain = uncertainEntry?.uncertain;
  if (uncertain && uncertainRun) {
    const block: LoopBlock = {
      kind: 'recovery-block',
      reason: uncertain.reason,
      createdAt: now,
      sourceStepId: uncertain.stepId,
      sourceAttemptId: uncertain.attemptId,
    };
    const step = loop.runtime.stepStates[uncertain.stepId];
    const stepStates = step && inFlight(step)
      ? { ...loop.runtime.stepStates, [uncertain.stepId]: { ...step, status: 'failed' as const, updatedAt: now } }
      : loop.runtime.stepStates;
    const runsWithBlock = reconciledRuns.map((run) => run.id === uncertainRun.id ? { ...run, block } : run);
    return {
      ...base,
      status: loop.status === 'disabled' ? 'disabled' : 'blocked',
      runs: runsWithBlock,
      runtime: { ...base.runtime, activeRunId: undefined, stepStates, block },
      updatedAt: now,
    };
  }

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
