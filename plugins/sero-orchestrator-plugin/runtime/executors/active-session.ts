/**
 * Active-session step executor (D-11, FR-13/FR-14). Resolves the target
 * session, sends the generated instructions as a steer / follow-up / next-turn
 * context message, and observes turn completion by turnId. The live session
 * continues under standard Sero session rules and always uses its own
 * workspace root — never a managed worktree.
 */

import type { StepExecutor, StepRunInput } from '../engine-types';
import type { ActiveSessionTarget, Observation, StepAttempt, StepOutcome } from '../../shared/types';
import { buildStepTask } from './prompt';

function failedAttempt(input: StepRunInput, error: string): StepAttempt {
  const now = input.host.now();
  return {
    id: input.host.newId('attempt'),
    stepId: input.step.id,
    attemptNumber: input.attemptNumber,
    parentSessionId: input.parentSessionId,
    executionType: 'active-session',
    status: 'failed',
    outcome: { status: 'failed', summary: error },
    observations: [],
    startedAt: now,
    endedAt: now,
    error,
  };
}

/** Resolves the target session id from the step's SessionTarget. */
async function resolveSessionId(input: StepRunInput, target: ActiveSessionTarget): Promise<string | null> {
  if (target.sessionTarget.strategy === 'specific-session' && target.sessionTarget.sessionId) {
    return target.sessionTarget.sessionId;
  }
  const active = await input.host.session.getActiveForWorkspace(input.host.workspaceId);
  return active?.sessionId ?? null;
}

function awaitTurn(input: StepRunInput, sessionId: string): Promise<{ turnId: string; status: 'completed' | 'aborted' | 'error' }> {
  return new Promise((resolve) => {
    const off = input.host.session.onTurnComplete(sessionId, (result) => {
      off();
      resolve(result);
    });
    input.signal?.addEventListener('abort', () => {
      off();
      resolve({ turnId: 'aborted', status: 'aborted' });
    }, { once: true });
  });
}

export const activeSessionExecutor: StepExecutor = {
  async run(input): Promise<StepAttempt> {
    const target = input.step.execution as ActiveSessionTarget;
    const sessionId = await resolveSessionId(input, target);
    if (!sessionId) return failedAttempt(input, 'no active session available for this workspace');

    const task = buildStepTask(input.loop, input.step);
    const deliverAs = target.sessionTarget.deliverAs;
    const startedAt = input.host.now();

    let turnId: string | null;
    if (deliverAs === 'steer' || deliverAs === 'followUp') {
      ({ turnId } = await input.host.session.sendUserSteer(sessionId, task, { deliverAs, source: 'orchestrator' }));
    } else {
      ({ turnId } = await input.host.session.sendContextMessage(
        sessionId,
        { customType: 'orchestrator-context', content: task, display: true },
        { deliverAs, triggerTurn: target.sessionTarget.triggerTurn, source: 'orchestrator' },
      ));
    }

    // No turn was triggered (e.g. queued next-turn context): nothing to observe.
    if (!turnId) {
      return finishAttempt(input, sessionId, undefined, startedAt, { status: 'succeeded', summary: 'context delivered to session (no turn triggered)' });
    }

    const result = await awaitTurn(input, sessionId);
    const outcome: StepOutcome =
      result.status === 'completed'
        ? { status: 'succeeded', summary: `session turn ${result.turnId} completed` }
        : { status: 'failed', summary: `session turn ${result.turnId} ${result.status}` };
    return finishAttempt(input, sessionId, result.turnId, startedAt, outcome);
  },
};

function finishAttempt(
  input: StepRunInput,
  sessionId: string,
  turnId: string | undefined,
  startedAt: string,
  outcome: StepOutcome,
): StepAttempt {
  const observation: Observation = {
    id: input.host.newId('obs'),
    source: 'active-session',
    summary: outcome.summary,
    data: { sessionId, turnId },
    createdAt: input.host.now(),
  };
  return {
    id: input.host.newId('attempt'),
    stepId: input.step.id,
    attemptNumber: input.attemptNumber,
    parentSessionId: input.parentSessionId,
    executionType: 'active-session',
    status: outcome.status === 'failed' ? 'failed' : 'completed',
    outcome,
    resolvedSessionId: sessionId,
    sessionTurnId: turnId,
    observations: [observation],
    startedAt,
    endedAt: input.host.now(),
  };
}
