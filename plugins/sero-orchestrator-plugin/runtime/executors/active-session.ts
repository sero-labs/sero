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

/** Fallback per-step turn timeout when the loop sets no wall-clock budget. */
const DEFAULT_TURN_TIMEOUT_MS = 30 * 60_000;

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

interface TurnObservation {
  turnId: string;
  status: 'completed' | 'aborted' | 'error' | 'timeout';
}

/**
 * Per-step turn timeout. A live session that never finishes its turn must not
 * keep an Orchestrator run active forever (limit checks only run between
 * batches). The bound is the loop's remaining wall-clock budget; with no
 * wall-clock limit set, a generous fixed fallback applies.
 */
function turnTimeoutMs(input: StepRunInput): number {
  const budget = input.loop.limits.maxWallClockMs;
  if (budget === undefined) return DEFAULT_TURN_TIMEOUT_MS;
  const remaining = budget - (Date.parse(input.host.now()) - Date.parse(input.run.startedAt));
  return Number.isFinite(remaining) && remaining > 0 ? remaining : DEFAULT_TURN_TIMEOUT_MS;
}

/**
 * Awaits the completion of the turn Orchestrator triggered, bounded by a
 * timeout. When a concrete `expectedTurnId` is known, completions for other
 * turns are ignored so an unrelated turn finishing first cannot be mistaken for
 * this step's result; when it is unknown (the bridge could not observe a
 * distinct turn id), the next completion is taken — still timeout-bounded.
 */
function awaitTurn(
  input: StepRunInput,
  sessionId: string,
  expectedTurnId: string | undefined,
  timeoutMs: number,
): Promise<TurnObservation> {
  return new Promise((resolve) => {
    let settled = false;
    let off = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => finish({ turnId: 'aborted', status: 'aborted' });
    function finish(result: TurnObservation): void {
      if (settled) return;
      settled = true;
      off();
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    }
    off = input.host.session.onTurnComplete(sessionId, (result) => {
      if (expectedTurnId && result.turnId !== expectedTurnId) return; // not our turn
      finish(result);
    });
    timer = setTimeout(() => finish({ turnId: expectedTurnId ?? 'unknown', status: 'timeout' }), timeoutMs);
    input.signal?.addEventListener('abort', onAbort, { once: true });
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

    // `triggered` is decided here (not inferred from a turn id): a steer/follow-up
    // always runs a turn; a context message runs one only when triggerTurn is set.
    let turnId: string | null;
    let triggered: boolean;
    if (deliverAs === 'steer' || deliverAs === 'followUp') {
      ({ turnId } = await input.host.session.sendUserSteer(sessionId, task, { deliverAs, source: 'orchestrator' }));
      triggered = true;
    } else {
      ({ turnId } = await input.host.session.sendContextMessage(
        sessionId,
        { customType: 'orchestrator-context', content: task, display: true },
        { deliverAs, triggerTurn: target.sessionTarget.triggerTurn, source: 'orchestrator' },
      ));
      triggered = target.sessionTarget.triggerTurn;
    }

    // No turn was triggered (e.g. queued next-turn context): nothing to observe.
    if (!triggered) {
      return finishAttempt(input, sessionId, undefined, startedAt, { status: 'succeeded', summary: 'context delivered to session (no turn triggered)' });
    }

    const timeoutMs = turnTimeoutMs(input);
    const result = await awaitTurn(input, sessionId, turnId ?? undefined, timeoutMs);
    const outcome: StepOutcome =
      result.status === 'completed'
        ? { status: 'succeeded', summary: `session turn ${result.turnId} completed` }
        : result.status === 'timeout'
          ? { status: 'failed', summary: `active-session step timed out after ${Math.round(timeoutMs / 1000)}s waiting for the live session to finish its turn` }
          : { status: 'failed', summary: `session turn ${result.turnId} ${result.status}` };
    return finishAttempt(input, sessionId, result.status === 'timeout' ? undefined : result.turnId, startedAt, outcome);
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
