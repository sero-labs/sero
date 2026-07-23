/** Executes one ready batch, including activation, feedback, recovery and parking. */

import type { HumanQuestion, Loop, LoopRun, LoopStepDefinition, RecoveryDecision, StepAttempt, StepOutcome } from '../shared/types';
import type { EngineDeps } from './engine-types';
import type { OrchestratorHost } from './host';
import { startActivations, recordActivationAttempt, settleActivation } from './activations';
import { applyFeedbackTraversal, feedbackDecision, feedbackExhaustedOutcome } from './feedback-runtime';
import { enforceRouteContract } from './route-contract';
import { acceptsCompletion, applyStepOutcome, recordCompletion } from './outcomes';
import { enforceDeliveryContract } from './delivery/delivery-contract';
import { applyDeliveryContract } from './delivery/verify-receipt';
import { recordAgentWarning, recordModelWarning } from './run-warnings';
import { blockLimit, resetStepPending, replaceRun, resolveOutcome } from './run-engine-helpers';
import { runFanOutStep } from './fan-out-run';
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

interface RoutedFeedbackOutcome {
  outcome: StepOutcome;
  route: ReturnType<typeof feedbackDecision>;
}

function routeFeedbackOutcome(loop: Loop, step: LoopStepDefinition, outcome: StepOutcome): RoutedFeedbackOutcome {
  const route = feedbackDecision(loop, step, outcome);
  return { outcome: route === 'exhausted' ? feedbackExhaustedOutcome(step, outcome) : outcome, route };
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

function syncRun(loop: Loop, run: LoopRun): Loop {
  return { ...loop, runs: replaceRun(loop.runs, run) };
}

export async function runStepBatch(input: RunBatchInput): Promise<{ loop: Loop; run: LoopRun; stop: boolean }> {
  const { host, deps, batch, signal, commit } = input;
  let { loop, run } = input;
  const startNow = host.now();
  // A fan-out step is always batched alone (run-engine) and creates its own
  // per-item activations; only plain steps get a visit activation here.
  const fanOutStep = batch.length === 1 ? loop.plan.steps.find((step) => step.id === batch[0] && step.fanOut) : undefined;
  const started = startActivations(loop, run, fanOutStep ? [] : batch, startNow);
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
  let attempts: StepAttempt[];
  if (fanOutStep) {
    // Expands the collection, runs activations in bounded waves (committing per
    // wave), and returns ONE join attempt that flows through the ordinary
    // outcome/recovery path below like any single step's attempt.
    const result = await runFanOutStep({ host, deps, loop, run, step: fanOutStep, signal, commit });
    loop = result.loop;
    run = result.run;
    // A management limit tripped mid-fan-out: block the loop directly, exactly
    // like the engine's pre-batch limit check — no LLM recovery, and the block is
    // recorded as `management-limit`, not `recovery-block`. The step returns to
    // pending so a later retry resumes from the persisted manifest (settled
    // activations are not repeated).
    if (result.limit) {
      const now = host.now();
      loop = blockLimit(resetStepPending(loop, fanOutStep.id, now), result.limit.limit, result.limit.reason ?? 'management limit reached', now);
      run = { ...run, status: 'blocked', block: loop.runtime.block };
      loop = await commit(syncRun(loop, run));
      return { loop, run, stop: true };
    }
    attempts = [result.attempt!];
  } else {
    attempts = await Promise.all(steps.map((step) => deps.executor.run({
      host,
      loop,
      run,
      step,
      attemptNumber: loop.runtime.stepStates[step.id].attempts,
      parentSessionId: loop.runtime.parentSessionId,
      workspace: loop.runtime.workspace.resolved,
      signal,
    })));
  }

  if (signal?.aborted) return { loop, run: { ...run, status: 'cancelled' }, stop: true };

  let stop = false;
  let parked: { stepId: string; questions: HumanQuestion[] } | undefined;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const attempt = attempts[index];
    let { outcome, route } = routeFeedbackOutcome(loop, step, await applyDeliveryContract(
      host,
      loop,
      step,
      enforceRouteContract(loop, step, await resolveOutcome(host, deps, loop, step, attempt)),
    ));
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
      let recoveryAttempt = recorded;
      let repeatedAcceptedExhaustion = false;
      while (TERMINAL_OUTCOMES.has(outcome.status)) {
        const rawDecision = await deps.decider.decide({ host, loop, step, attempt: recoveryAttempt, outcome });
        // Retrying the source after exhaustion cannot make progress: the region
        // that feeds it is unchanged, so it re-matches and re-exhausts, burning
        // the per-step budget. Route a post-exhaustion retry to a decisive block
        // instead — the same rail the accept-step path already enforces below.
        const decision: RecoveryDecision = route === 'exhausted' && rawDecision.decision === 'retry-step'
          ? { ...rawDecision, decision: 'block-loop', reason: `${outcome.summary} Retrying the source after exhaustion cannot make progress; blocking for human revision.` }
          : rawDecision;
        run = { ...run, recoveryDecisions: [...run.recoveryDecisions, decision] };
        if (decision.decision === 'accept-step' && decision.acceptedOutcome) {
          const acceptedRoute = routeFeedbackOutcome(
            loop,
            step,
            enforceDeliveryContract(loop, step, enforceRouteContract(loop, step, decision.acceptedOutcome)),
          );
          outcome = acceptedRoute.outcome;
          route = acceptedRoute.route;
          run = settleActivation(run, activationId, outcome, host.now());
          const accepted = applyOutcome(host, loop, run, step.id, recorded, outcome);
          loop = accepted.loop;
          run = accepted.run;
          if (accepted.completed) {
            loop = await commit(syncRun(loop, run));
            return { loop, run, stop: true };
          }
          if (route === 'traverse') {
            loop = applyFeedbackTraversal(syncRun(loop, run), run, step, activationId, recorded, outcome, host.now());
            loop = await commit(loop);
            break;
          }
          if (route !== 'exhausted') break;
          if (repeatedAcceptedExhaustion) {
            const blocked = applyRecovery(host, loop, {
              ...decision,
              decision: 'block-loop',
              reason: `${outcome.summary} Recovery accepted another matching outcome after exhaustion.`,
            });
            loop = blocked.loop;
            run = { ...run, status: 'blocked' };
            stop = true;
            break;
          }
          repeatedAcceptedExhaustion = true;
          recoveryAttempt = { ...recorded, outcome };
          continue;
        }

        const recovery = applyRecovery(host, loop, decision);
        loop = recovery.loop;
        if (decision.decision === 'skip-step') {
          const skippedOutcome = loop.runtime.stepStates[step.id]?.outcome;
          if (skippedOutcome) run = settleActivation(run, activationId, skippedOutcome, host.now());
        }
        if (recovery.rejection) {
          run = { ...run, observations: [...run.observations, { id: host.newId('obs'), source: 'system', summary: recovery.rejection, createdAt: host.now() }] };
        }
        if (recovery.stop) {
          run = { ...run, status: decision.decision === 'block-loop' ? 'blocked' : 'waiting' };
          stop = true;
        }
        break;
      }
      if (stop) break;
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
