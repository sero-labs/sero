// Active-session execution adapter (Phase 4). Instead of spawning a worker, this
// adapter steers the workspace's live agent session to perform the attempt's
// change, then measures what changed with git at the attempt cwd — exactly like
// the background-worker adapter. The coordinator core still owns the whole
// attempt lifecycle (workdir, baseRef, dirty-root gate, budgets, checks, stop
// rules, restore); this adapter only adds the "perform the change" step for
// session-targeted attempts (D-05, D-06).
//
// Two seams from the core call in:
//   • preflight — the readiness gate. Resolves the SessionTarget and gates on the
//     session being idle with no pending messages; a busy/unavailable session
//     DEFERS the run (no attempt burned), retried on the next trigger.
//   • execute — subscribe-before-send (mirrors diagnostics.ts), send a steer via
//     the Phase 1.5 host.session seam capturing the turn id, observe completion
//     correlated by that id, then measure the diff at the cwd.
//
// Active-session is permanently workspace-root: worktree isolation is the
// background worker's job (D-06), enforced here as defense-in-depth.

import type { AppRuntimeHost, TurnCompletion } from '@sero-ai/common';

import type { LoopGoal, SessionTarget } from '../../shared/types';
import type {
  AttemptContext,
  AttemptExecutionResult,
  AttemptOutcomeStatus,
  AttemptPreflight,
  AttemptPreflightContext,
  AttemptAdapter,
} from '../adapter';
import type { WorkerSessionRegistry } from '../recursion-guard';
import { computeDiffFingerprint, listChangedFiles } from '../vcs';
import { buildImplementerInstruction, priorFinishedAttempt } from '../workers';

/** Safety net when no per-attempt budget timeout bounds the steered turn. */
const TURN_OBSERVE_FALLBACK_MS = 30 * 60_000;

export interface ActiveSessionAdapterDeps {
  /**
   * Marks the steered session a worker for the duration of its turn so the
   * recursion guard rejects any orchestrator control action that turn issues
   * (D-16). The session is a real user session, so this hold is scoped tightly
   * to the turn and released as soon as it completes.
   */
  workerSessions: WorkerSessionRegistry;
}

/** Create the active-session adapter the coordinator registers by default. */
export function createActiveSessionAdapter(
  deps: ActiveSessionAdapterDeps,
): AttemptAdapter {
  return {
    mode: 'active-session',
    preflight: (ctx) => preflight(ctx),
    execute: (ctx) => execute(deps, ctx),
  };
}

// ── Readiness gate ─────────────────────────────────────────────────────────────

async function preflight(ctx: AttemptPreflightContext): Promise<AttemptPreflight> {
  const resolved = await resolveTarget(ctx.host, ctx.workspaceId, ctx.loop);
  if ('defer' in resolved) return { ready: false, reason: resolved.defer };

  const { state } = resolved;
  if (!state.idle || state.pendingMessages > 0) {
    const why = !state.idle
      ? 'a turn is in progress'
      : `${state.pendingMessages} message(s) pending`;
    return { ready: false, reason: `the active session is busy (${why})` };
  }
  return { ready: true };
}

// ── Perform the change ──────────────────────────────────────────────────────────

async function execute(
  deps: ActiveSessionAdapterDeps,
  ctx: AttemptContext,
): Promise<AttemptExecutionResult> {
  // Defense-in-depth: active-session only ever runs at the workspace root (D-06).
  if (ctx.attempt.workdir.mode !== 'workspace-root') {
    return {
      status: 'error',
      changedFiles: [],
      error: 'Active-session attempts must run at the workspace root (D-06).',
    };
  }

  const resolved = await resolveTarget(ctx.host, ctx.workspaceId, ctx.loop);
  if ('defer' in resolved) {
    // The session changed/vanished between preflight and now — a rare race; the
    // loop records a failed attempt and retries (no live tree was touched).
    return { status: 'error', changedFiles: [], error: `Cannot steer: ${resolved.defer}.` };
  }
  const sessionId = resolved.sessionId;

  const instruction = buildImplementerInstruction({
    loop: ctx.loop,
    priorAttempt: priorFinishedAttempt(ctx.loop, ctx.attempt),
  });
  // Record the (redacted) steer prompt on the attempt for replay (D-08).
  ctx.attempt.workerInstruction = instruction;

  // Subscribe before sending so a fast turn cannot complete unobserved. Hold the
  // steered session as a worker for the turn so the recursion guard rejects any
  // control action it issues (D-16).
  const completion = observeTurn(ctx.host, sessionId, ctx.signal, ctx.timeoutMs);
  deps.workerSessions.markActive(sessionId);
  try {
    const { turnId } = await ctx.host.session.sendUserSteer(sessionId, instruction.taskPrompt, {
      deliverAs: resolved.target.deliverAs,
      source: 'orchestrator',
    });
    const outcome = await completion;

    if (ctx.signal.aborted) {
      return { status: 'aborted', changedFiles: [], sessionTurnId: turnId, error: 'Aborted' };
    }

    const status = turnOutcomeStatus(outcome);
    const changedFiles = await listChangedFiles(ctx.host, ctx.workspaceId, ctx.cwd);
    const diffFingerprint =
      changedFiles.length > 0
        ? await computeDiffFingerprint(ctx.host, ctx.workspaceId, ctx.cwd, ctx.attempt.baseRef)
        : undefined;

    return {
      status,
      changedFiles,
      diffFingerprint,
      sessionTurnId: turnId,
      error: errorFor(status, outcome),
    };
  } finally {
    deps.workerSessions.clear(sessionId);
  }
}

// ── Target resolution ──────────────────────────────────────────────────────────

interface ResolvedTarget {
  sessionId: string;
  target: SessionTarget;
  state: { idle: boolean; pendingMessages: number; activeTurnId: string | null };
}

/**
 * Resolve the loop's {@link SessionTarget} to a concrete, readable session, or a
 * defer reason. Only ever reads `getState` for the workspace's *active* session
 * (known to exist), so it never has to swallow an unknown-session throw: a bound
 * session that is not currently the active one defers until it is (D-05).
 */
async function resolveTarget(
  host: AppRuntimeHost,
  workspaceId: string,
  loop: LoopGoal,
): Promise<ResolvedTarget | { defer: string }> {
  const target = sessionTargetFor(loop, workspaceId);
  const active = await host.session.getActiveForWorkspace(workspaceId);
  if (!active) return { defer: 'no active session to steer' };
  if (target.sessionId && target.sessionId !== active.sessionId) {
    return { defer: 'the bound session is not the active session in this workspace' };
  }
  const state = await host.session.getState(active.sessionId);
  return { sessionId: active.sessionId, target, state };
}

/** Derive the SessionTarget from the loop: a bound session, else most-recent-active (D-05). */
function sessionTargetFor(loop: LoopGoal, workspaceId: string): SessionTarget {
  return {
    workspaceId,
    sessionId: loop.sessionId,
    strategy: loop.sessionId ? 'specific-session' : 'most-recent-active',
    deliverAs: 'followUp',
    triggerTurn: true,
  };
}

// ── Turn observation ───────────────────────────────────────────────────────────

/**
 * Resolve with the steered turn's completion, or null if it is cancelled
 * (`signal`, from stop/pause or the per-attempt timeout) or never observed.
 * Mirrors diagnostics.ts; the budget timeout already aborts `signal`, so the
 * fallback timer only guards a loop with no wall-clock bound.
 */
function observeTurn(
  host: AppRuntimeHost,
  sessionId: string,
  signal: AbortSignal,
  timeoutMs: number | undefined,
): Promise<TurnCompletion | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: TurnCompletion | null) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    const unsubscribe = host.session.onTurnComplete(sessionId, (completion) => finish(completion));
    const window = timeoutMs && timeoutMs > 0 ? timeoutMs : TURN_OBSERVE_FALLBACK_MS;
    const timer = setTimeout(() => finish(null), window);
    if (signal.aborted) finish(null);
    else signal.addEventListener('abort', onAbort);
  });
}

function turnOutcomeStatus(outcome: TurnCompletion | null): AttemptOutcomeStatus {
  if (!outcome) return 'error'; // not observed within the window
  if (outcome.status === 'completed') return 'completed';
  if (outcome.status === 'aborted') return 'aborted';
  return 'error';
}

function errorFor(status: AttemptOutcomeStatus, outcome: TurnCompletion | null): string | undefined {
  if (status === 'completed') return undefined;
  if (!outcome) return 'The steered turn did not complete within the window.';
  return `The steered turn ${outcome.status}.`;
}
