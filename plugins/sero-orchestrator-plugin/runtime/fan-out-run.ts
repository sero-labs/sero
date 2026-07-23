/**
 * Fan-out step execution (specs/17-dynamic-fan-out.md): expand → persist the
 * manifest → run activations in bounded waves → join into one StepOutcome.
 *
 * The returned join attempt flows through run-batch's ordinary outcome path
 * (apply, recovery, parking), so a recovery `retry-step` simply re-enters here
 * — the persisted manifest is reused and only unsettled activations re-run,
 * preserving succeeded siblings.
 */

import type { Loop, LoopRun, LoopStepDefinition, Observation, StepActivation, StepAttempt, StepOutcome } from '../shared/types';
import type { EngineDeps } from './engine-types';
import type { OrchestratorHost } from './host';
import { recordActivationAttempt } from './activations';
import { buildFanOutAggregate, expandFanOut, fanOutActivations, fanOutJoinOutcome, runnableFanOutActivations } from './fan-out';
import { checkManagementLimits } from './limits';
import { replaceRun, resolveOutcome } from './run-engine-helpers';
import { recordAgentWarning, recordModelWarning } from './run-warnings';

export interface FanOutRunInput {
  host: OrchestratorHost;
  deps: EngineDeps;
  loop: Loop;
  run: LoopRun;
  step: LoopStepDefinition;
  signal?: AbortSignal;
  commit(loop: Loop): Promise<Loop>;
}

export interface FanOutRunResult {
  loop: Loop;
  run: LoopRun;
  /** Join attempt carrying the step-level outcome; run-batch records and applies it. */
  attempt: StepAttempt;
}

function syncRun(loop: Loop, run: LoopRun): Loop {
  return { ...loop, runs: replaceRun(loop.runs, run) };
}

function joinAttempt(input: FanOutRunInput, outcome: StepOutcome): StepAttempt {
  const { host, loop, step } = input;
  const now = host.now();
  const observation: Observation = { id: host.newId('obs'), source: 'system', summary: outcome.summary, createdAt: now };
  return {
    id: host.newId('attempt'),
    stepId: step.id,
    attemptNumber: loop.runtime.stepStates[step.id]?.attempts ?? 1,
    parentSessionId: loop.runtime.parentSessionId,
    executionType: step.execution.type,
    status: outcome.status === 'succeeded' ? 'completed' : 'failed',
    outcome,
    workspace: loop.runtime.workspace.resolved,
    observations: [observation],
    startedAt: now,
    endedAt: now,
  };
}

function setActivationsRunning(run: LoopRun, ids: Set<string>): LoopRun {
  return {
    ...run,
    stepActivations: (run.stepActivations ?? []).map((activation) =>
      ids.has(activation.id) ? { ...activation, status: 'running' as const, endedAt: undefined } : activation),
  };
}

/** min of the step's own cap and the loop-wide concurrent-steps cap. */
function effectiveConcurrency(loop: Loop, step: LoopStepDefinition): number {
  const cap = Math.min(step.fanOut?.maxConcurrency ?? Infinity, loop.limits.maxConcurrentSteps ?? Infinity);
  return Number.isFinite(cap) && cap >= 1 ? cap : Number.MAX_SAFE_INTEGER;
}

export async function runFanOutStep(input: FanOutRunInput): Promise<FanOutRunResult> {
  const { host, deps, step, signal, commit } = input;
  let { loop, run } = input;
  const fanOut = step.fanOut!;

  // Reuse this run's persisted manifest (a recovery retry or an answered
  // question re-enters here) so activation identities stay stable and settled
  // work is not repeated; otherwise expand the source collection now.
  const existing = loop.runtime.fanOutStates?.[step.id];
  let manifest = existing?.manifest.runId === run.id ? existing.manifest : undefined;
  if (!manifest) {
    const expansion = expandFanOut(loop, run, step, host.now());
    if (!expansion.ok) return { loop, run, attempt: joinAttempt(input, { status: 'blocked', summary: expansion.reason }) };
    manifest = expansion.manifest;
  }

  // Persist the manifest and the pending activation records BEFORE any
  // activation starts, so a restart reconstructs the same expansion.
  const known = new Set((run.stepActivations ?? []).map((a) => a.id));
  const created: StepActivation[] = manifest.items
    .filter((item) => !known.has(item.activationId))
    .map((item) => ({
      id: item.activationId,
      stepId: step.id,
      visitNumber: 1,
      status: 'pending',
      fanOut: { index: item.index, key: item.key, item: item.item },
      attemptIds: [],
      startedAt: host.now(),
    }));
  run = { ...run, stepActivations: [...(run.stepActivations ?? []), ...created] };
  loop = {
    ...loop,
    runtime: { ...loop.runtime, fanOutStates: { ...loop.runtime.fanOutStates, [step.id]: { manifest } } },
  };
  loop = await commit(syncRun(loop, run));

  const itemById = new Map(manifest.items.map((item) => [item.activationId, item]));
  const concurrency = effectiveConcurrency(loop, step);
  // Each activation runs at most once per step-run; a failure is retried only
  // by a later recovery decision, never by looping within this invocation.
  const executed = new Set<string>();
  let questions: StepOutcome['questions'];
  let limitReason: string | undefined;

  while (!signal?.aborted && !questions && !limitReason) {
    const wave = runnableFanOutActivations(run, manifest)
      .filter((activation) => !executed.has(activation.id))
      .slice(0, concurrency);
    if (wave.length === 0) break;
    const limit = checkManagementLimits(loop, run, Date.parse(host.now()));
    if (!limit.ok) {
      limitReason = limit.reason ?? 'management limit reached';
      break;
    }
    for (const activation of wave) executed.add(activation.id);
    run = setActivationsRunning(run, new Set(wave.map((a) => a.id)));
    loop = await commit(syncRun(loop, run));

    const attempts = await Promise.all(wave.map((activation) => {
      const item = itemById.get(activation.id)!;
      return deps.executor.run({
        host,
        loop,
        run,
        step,
        attemptNumber: activation.attemptIds.length + 1,
        parentSessionId: loop.runtime.parentSessionId,
        workspace: loop.runtime.workspace.resolved,
        signal,
        fanOut: {
          activationId: activation.id,
          key: item.key,
          index: item.index,
          total: manifest.itemCount,
          itemVariable: fanOut.itemVariable,
          item: item.item,
        },
      });
    }));

    for (const [index, attempt] of attempts.entries()) {
      const activation = wave[index];
      const outcome = await resolveOutcome(host, deps, loop, step, attempt);
      const recorded: StepAttempt = { ...attempt, activationId: activation.id, outcome };
      run = {
        ...run,
        stepAttempts: [...run.stepAttempts, recorded],
        observations: [...run.observations, ...recorded.observations],
      };
      run = recordActivationAttempt(run, activation.id, recorded, outcome, host.now(), !outcome.questions?.length);
      if (recorded.modelFallback) loop = recordModelWarning(host, loop, step.id, recorded.modelFallback.requestedModel);
      if (recorded.agentFallback) loop = recordAgentWarning(host, loop, step.id, recorded.agentFallback.requestedAgent);
      if (outcome.questions?.length && !questions) questions = outcome.questions;
    }
    loop = await commit(syncRun(loop, run));
  }

  if (questions) {
    const outcome: StepOutcome = {
      status: 'needs-revision',
      summary: `Fan-out "${step.id}": an activation needs the user's answer before it can finish.`,
      questions,
    };
    return { loop, run, attempt: joinAttempt({ ...input, loop }, outcome) };
  }
  if (limitReason) {
    return { loop, run, attempt: joinAttempt({ ...input, loop }, { status: 'blocked', summary: `Fan-out "${step.id}" stopped: ${limitReason}` }) };
  }

  const aggregate = buildFanOutAggregate(manifest, fanOutActivations(run, manifest));
  loop = {
    ...loop,
    runtime: { ...loop.runtime, fanOutStates: { ...loop.runtime.fanOutStates, [step.id]: { manifest, aggregate } } },
  };
  return { loop, run, attempt: joinAttempt({ ...input, loop }, fanOutJoinOutcome(step, aggregate)) };
}
