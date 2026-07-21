/** Executes one ready batch, including activation, feedback, recovery and parking. */

import type { HumanQuestion, Loop, LoopRun, LoopStepDefinition, StepAttempt, StepOutcome } from '../shared/types';
import type { EngineDeps } from './engine-types';
import type { OrchestratorHost } from './host';
import { startActivations, recordActivationAttempt } from './activations';
import { applyFeedbackTraversal, feedbackDecision, feedbackExhaustedOutcome } from './feedback-runtime';
import { enforceRouteContract } from './route-contract';
import { acceptsCompletion, applyStepOutcome, recordCompletion } from './outcomes';
import { enforceDeliveryContract } from './delivery/delivery-contract';
import { applyDeliveryContract } from './delivery/verify-receipt';
import { recordAgentWarning, recordModelWarning } from './run-warnings';
import { resetStepPending, replaceRun } from './run-engine-helpers';
import { parkForInput } from './human-input';
import { applyRecovery } from './recovery-apply';
import { isRecurring } from './scheduler';

const TERMINAL_OUTCOMES = new Set<StepOutcome['status']>(['failed', 'blocked', 'needs-revision']);

export interface RunBatchInput {
  host: OrchestratorHost;
  deps: EngineDeps;
  loop: Loop;
  run: LoopRun;
  batch: string[];
  signal?: AbortSignal;
  commit(loop: Loop): Promise<Loop>;
}

interface AppliedOutcome {
  loop: Loop;
  run: LoopRun;
  completed: boolean;
}

function applyOutcome(host: OrchestratorHost, loop: Loop, run: LoopRun, stepId: string, attempt: StepAttempt, outcome: StepOutcome): AppliedOutcome {
  loop = applyStepOutcome(loop, stepId, attempt, outcome, host.now());
  if (!outcome.completion || !acceptsCompletion(host, loop, stepId, outcome.completion)) return { loop, run, completed: false };
  const completed = recordCompletion(host, loop, stepId, attempt, outcome);
  return {
    loop: completed.loop,
    run: { ...run, completionSignal: completed.signal, status: completed.signal.status === 'complete' ? 'completed' : 'blocked' },
    completed: true,
  };
}

async function resolveOutcome(host: OrchestratorHost, deps: EngineDeps, loop: Loop, step: LoopStepDefinition, attempt: StepAttempt): Promise<StepOutcome> {
  if (attempt.outcome) return attempt.outcome;
  if (deps.evaluator) return deps.evaluator.evaluate({ host, loop, step, attempt });
  return { status: attempt.status === 'completed' ? 'succeeded' : 'failed', summary: attempt.error ?? `step ${step.id} ${attempt.status}` };
}

function syncRun(loop: Loop, run: LoopRun): Loop {
  return { ...loop, runs: replaceRun(loop.runs, run) };
}

export async function runStepBatch(input: RunBatchInput): Promise<{ loop: Loop; run: LoopRun; stop: boolean }> {
  const { host, deps, batch, signal, commit } = input;
  let { loop, run } = input;
  const startNow = host.now();
  const started = startActivations(loop, run, batch, startNow);
  loop = started.loop;
  run = { ...started.run, startedStepIds: [...run.startedStepIds, ...batch] };
  for (const stepId of batch) {
    const prev = loop.runtime.stepStates[stepId];
    loop = {
      ...loop,
      runtime: { ...loop.runtime, stepStates: { ...loop.runtime.stepStates, [stepId]: { ...prev, status: 'running', attempts: prev.attempts + 1, updatedAt: startNow } } },
    };
  }
  loop = await commit(syncRun(loop, run));

  const steps = batch.map((id) => loop.plan.steps.find((step) => step.id === id)!);
  const attempts = await Promise.all(steps.map((step) => deps.executor.run({
    host,
    loop,
    run,
    step,
    attemptNumber: loop.runtime.stepStates[step.id].attempts,
    parentSessionId: loop.runtime.parentSessionId,
    workspace: loop.runtime.workspace.resolved,
    signal,
  })));

  if (signal?.aborted) return { loop, run: { ...run, status: 'cancelled' }, stop: true };

  let stop = false;
  let parked: { stepId: string; questions: HumanQuestion[] } | undefined;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const attempt = attempts[index];
    let outcome = await applyDeliveryContract(
      host,
      loop,
      step,
      enforceRouteContract(loop, step, await resolveOutcome(host, deps, loop, step, attempt)),
    );
    const route = feedbackDecision(loop, step, outcome);
    if (route === 'exhausted') outcome = feedbackExhaustedOutcome(step);
    const activationId = started.activationIds[step.id];
    const recorded: StepAttempt = { ...attempt, activationId, outcome };
    run = {
      ...run,
      stepAttempts: [...run.stepAttempts, recorded],
      observations: [...run.observations, ...recorded.observations],
    };
    run = recordActivationAttempt(run, activationId, recorded, outcome, host.now(), !outcome.questions?.length);
    loop = syncRun(loop, run);
    if (recorded.modelFallback) loop = recordModelWarning(host, loop, step.id, recorded.modelFallback.requestedModel);
    if (recorded.agentFallback) loop = recordAgentWarning(host, loop, step.id, recorded.agentFallback.requestedAgent);

    if (outcome.questions?.length) {
      loop = resetStepPending(loop, step.id, host.now());
      parked ??= { stepId: step.id, questions: outcome.questions };
      continue;
    }

    const applied = applyOutcome(host, loop, run, step.id, recorded, outcome);
    loop = applied.loop;
    run = applied.run;
    if (applied.completed) {
      loop = await commit(syncRun(loop, run));
      return { loop, run, stop: true };
    }

    if (route === 'traverse') {
      loop = applyFeedbackTraversal(syncRun(loop, run), run, step, activationId, recorded, outcome, host.now());
      loop = await commit(loop);
      continue;
    }

    if (deps.stopChecker && !TERMINAL_OUTCOMES.has(outcome.status) && isRecurring(loop)) {
      const decision = await deps.stopChecker.check({ host, loop, run });
      if (decision.stop) {
        host.log(`Loop ${loop.id} run ended early — nothing to do: ${decision.reason}`);
        run = { ...run, status: 'completed' };
        loop = await commit(syncRun(loop, run));
        return { loop, run, stop: true };
      }
    }

    if (TERMINAL_OUTCOMES.has(outcome.status)) {
      const decision = await deps.decider.decide({ host, loop, step, attempt: recorded, outcome });
      run = { ...run, recoveryDecisions: [...run.recoveryDecisions, decision] };
      if (decision.decision === 'accept-step' && decision.acceptedOutcome) {
        const accepted = applyOutcome(host, loop, run, step.id, recorded, enforceDeliveryContract(loop, step, decision.acceptedOutcome));
        loop = accepted.loop;
        run = accepted.run;
        if (accepted.completed) {
          loop = await commit(syncRun(loop, run));
          return { loop, run, stop: true };
        }
        continue;
      }
      const recovery = applyRecovery(host, loop, decision);
      loop = recovery.loop;
      if (recovery.rejection) {
        run = { ...run, observations: [...run.observations, { id: host.newId('obs'), source: 'system', summary: recovery.rejection, createdAt: host.now() }] };
      }
      if (recovery.stop) {
        run = { ...run, status: decision.decision === 'block-loop' ? 'blocked' : 'waiting' };
        stop = true;
        break;
      }
    }
  }

  if (parked && !stop) {
    loop = parkForInput(host, syncRun(loop, run), parked.stepId, parked.questions, run.id);
    run = { ...run, status: 'waiting' };
    loop = await commit(syncRun(loop, run));
    return { loop, run, stop: true };
  }
  loop = await commit(syncRun(loop, run));
  return { loop, run, stop };
}
