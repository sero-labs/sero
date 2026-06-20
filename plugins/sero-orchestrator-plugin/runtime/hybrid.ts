// Hybrid execution routing (D-09). A `hybrid` loop chooses between the
// background-worker and active-session adapters per attempt, governed by its
// `HybridPolicy` and the live session state, with the chosen reason recorded on
// the attempt (`LoopAttempt.routingReason`).
//
// One rule overrides every policy: worktree isolation is background-worker only
// (D-06) — the active session always steers the workspace root, so a worktree
// attempt can never be routed to it. The decision is a pure function so it is
// trivially testable; the async session probe that feeds it lives alongside it.

import type { AppRuntimeHost } from '@sero-ai/common';

import type { AttemptExecutionMode, HybridPolicy } from '../shared/types';

/** Liveness of the workspace's active session, used to route `hybrid` loops. */
export interface SessionAvailability {
  /** A session exists that could be steered. */
  available: boolean;
  /** …and it is idle with no pending messages (safe to steer right now). */
  idle: boolean;
}

export interface HybridRouteInput {
  policy: HybridPolicy;
  session: SessionAvailability;
  /** The attempt would run in an isolated worktree (Phase 6) — forces worker (D-06). */
  useWorktree: boolean;
}

export interface HybridRoute {
  mode: AttemptExecutionMode;
  reason: string;
}

const WORKER: AttemptExecutionMode = 'background-worker';
const SESSION: AttemptExecutionMode = 'active-session';

/**
 * Decide which adapter a `hybrid` attempt runs on. Worktree isolation always
 * wins for the background worker (D-06); otherwise the policy decides, falling
 * back to the worker whenever the active session is unavailable.
 */
export function routeHybrid(input: HybridRouteInput): HybridRoute {
  if (input.useWorktree) {
    return { mode: WORKER, reason: 'Worktree isolation runs on the background worker (D-06).' };
  }
  const { available, idle } = input.session;
  switch (input.policy) {
    case 'prefer-background-worker':
      return { mode: WORKER, reason: 'Policy prefers the background worker.' };
    case 'prefer-active-session':
      return available
        ? { mode: SESSION, reason: 'Policy prefers steering the active session.' }
        : { mode: WORKER, reason: 'No active session to steer; using the background worker.' };
    case 'active-if-session-idle':
      if (available && idle) {
        return { mode: SESSION, reason: 'The active session is idle; steering it.' };
      }
      return {
        mode: WORKER,
        reason: available
          ? 'The active session is busy; using the background worker.'
          : 'No active session; using the background worker.',
      };
    case 'ask-user':
      // No interactive routing round-trip yet (Phase 6); default to the safe
      // background worker so an unattended loop still makes progress.
      return { mode: WORKER, reason: 'Awaiting a routing choice; defaulting to the background worker.' };
  }
}

/** Probe the workspace's active session for hybrid routing (D-05). */
export async function probeSessionAvailability(
  host: AppRuntimeHost,
  workspaceId: string,
): Promise<SessionAvailability> {
  const active = await host.session.getActiveForWorkspace(workspaceId);
  if (!active) return { available: false, idle: false };
  const state = await host.session.getState(active.sessionId);
  return { available: true, idle: state.idle && state.pendingMessages === 0 };
}
