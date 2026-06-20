// Active-session host seam proof (Phase 1.5 spike). Resolves the workspace's
// live session, reads idle/pending, sends a no-op diagnostic only when it is
// safe (idle + no pending), and observes that turn's completion correlated by
// `turnId`. Read-only with respect to loop state — it never touches an attempt
// or a goal, preserving the single-executor invariant. CLI-only proof surface.

import type { AppRuntimeHost, TurnCompletion } from '@sero-ai/common';

import type { OrchestratorActionResult } from '../shared/types';

// How long to wait for the diagnostic turn before reporting it unobserved.
const DIAGNOSTIC_TURN_TIMEOUT_MS = 60_000;

export interface DiagnoseDeps {
  host: AppRuntimeHost;
  workspaceId: string;
}

export async function diagnoseSession(deps: DiagnoseDeps): Promise<OrchestratorActionResult> {
  const { session } = deps.host;
  const active = await session.getActiveForWorkspace(deps.workspaceId);
  if (!active) {
    return { ok: true, message: 'No active session in this workspace to diagnose.' };
  }

  const state = await session.getState(active.sessionId);
  if (!state.idle || state.pendingMessages > 0) {
    const reason = !state.idle ? 'a turn is in progress' : `${state.pendingMessages} message(s) pending`;
    return {
      ok: true,
      message: `Deferred: session ${active.sessionId} is busy (${reason}). No message sent.`,
    };
  }

  // Subscribe before sending so a fast turn cannot complete unobserved.
  const completion = observeNextTurn(deps.host, active.sessionId);
  const { turnId } = await session.sendContextMessage(
    active.sessionId,
    {
      customType: 'orchestrator-diagnostic',
      content: 'Orchestrator session diagnostic — reply with a one-line acknowledgement.',
      display: false,
    },
    { deliverAs: 'nextTurn', triggerTurn: true, source: 'orchestrator' },
  );

  if (!turnId) {
    return { ok: false, error: 'Diagnostic delivered but no turn id was returned.' };
  }

  const result = await completion;
  if (!result) {
    return {
      ok: true,
      message: `Diagnostic turn ${turnId} sent to ${active.sessionId}; completion not observed within the window.`,
    };
  }

  const correlation = result.turnId === turnId ? 'matched' : `MISMATCH (observed ${result.turnId})`;
  return {
    ok: true,
    message: `Diagnostic ok — session ${active.sessionId}, turn ${turnId} ${result.status}, correlation ${correlation}.`,
  };
}

/** Resolve with the next observed turn completion, or null after a timeout. */
function observeNextTurn(host: AppRuntimeHost, sessionId: string): Promise<TurnCompletion | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: TurnCompletion | null) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value);
    };
    const unsubscribe = host.session.onTurnComplete(sessionId, (completion) => finish(completion));
    const timer = setTimeout(() => finish(null), DIAGNOSTIC_TURN_TIMEOUT_MS);
  });
}
