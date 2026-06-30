/**
 * Fake StepExecutor / RecoveryDecider for engine tests.
 */

import type { RecoveryDecider, StepExecutor, StepRunInput } from '../engine-types';
import type { RecoveryDecision, StepAttempt, StepOutcome } from '../../shared/types';

export type OutcomeSpec = StepOutcome | ((input: StepRunInput) => Promise<StepOutcome> | StepOutcome);

export interface FakeExecutor extends StepExecutor {
  calls: string[];
}

function buildAttempt(input: StepRunInput, outcome?: StepOutcome, outputPath?: string): StepAttempt {
  const now = input.host.now();
  return {
    id: input.host.newId('attempt'),
    stepId: input.step.id,
    attemptNumber: input.attemptNumber,
    parentSessionId: input.parentSessionId,
    executionType: input.step.execution.type,
    status: outcome && outcome.status === 'failed' ? 'failed' : 'completed',
    outcome,
    workspace: input.workspace,
    outputPath,
    observations: [],
    startedAt: now,
    endedAt: input.host.now(),
  };
}

/** Executor that returns a scripted outcome per step id. */
export function fakeExecutor(outcomes: Record<string, OutcomeSpec>): FakeExecutor {
  const calls: string[] = [];
  return {
    calls,
    async run(input) {
      calls.push(input.step.id);
      const spec = outcomes[input.step.id];
      const outcome = typeof spec === 'function' ? await spec(input) : spec;
      return buildAttempt(input, outcome);
    },
  };
}

/** Executor whose runs block until release() is called (for lock tests). */
export function gatedExecutor(outcome: StepOutcome): { executor: FakeExecutor; release: () => void } {
  const calls: string[] = [];
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    executor: {
      calls,
      async run(input) {
        calls.push(input.step.id);
        await gate;
        return buildAttempt(input, outcome);
      },
    },
    release: () => open(),
  };
}

/** Executor that writes a large artifact and reports its outputPath. */
export function artifactExecutor(content: string, outcome: StepOutcome): FakeExecutor {
  const calls: string[] = [];
  return {
    calls,
    async run(input) {
      calls.push(input.step.id);
      const ref = await input.host.writeArtifact(`${input.run.id}/${input.step.id}.txt`, content);
      return buildAttempt(input, outcome, ref);
    },
  };
}

/** Decider that returns a fixed decision, filling in ids from the input. */
export function fakeDecider(decision: Partial<RecoveryDecision> & Pick<RecoveryDecision, 'decision'>): RecoveryDecider {
  return {
    async decide(input) {
      return {
        id: input.host.newId('recovery'),
        stepId: input.step.id,
        failedAttemptId: input.attempt.id,
        reason: decision.reason ?? 'test decision',
        ...decision,
        createdAt: decision.createdAt ?? input.host.now(),
      };
    },
  };
}
