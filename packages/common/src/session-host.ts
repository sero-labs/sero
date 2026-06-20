/**
 * Active-session host contract — the one genuinely new desktop-core capability
 * the Sero Orchestrator needs (specs/02-integration-seams.md §New seam).
 *
 * It wraps the existing CLI session bridge so background runtime code (which
 * otherwise only sees its own invoking session through `sessionRuntime`) can
 * resolve a workspace's active session, read its idle/pending state, deliver a
 * steer or context message, and — the genuinely-new part — observe when the
 * resulting turn completes, correlated by `turnId`.
 *
 * Kept renderer-safe / Node-agnostic so plugins can type against it without
 * importing desktop internals. Payload shapes reuse the existing
 * session-runtime bridge types.
 */

import type {
  ExtensionRuntimeContent,
  ExtensionRuntimeMessage,
} from './session-runtime';

/** A workspace's resolved active agent session. */
export interface ActiveSession {
  sessionId: string;
  workspaceId: string;
  /** Last known session title, when set. */
  title?: string;
}

/** Snapshot used to decide whether a re-wake send is safe (D-05). */
export interface SessionState {
  /** Not streaming and no turn in flight — safe to send and trigger a turn. */
  idle: boolean;
  /** Queued steering + follow-up messages awaiting delivery. */
  pendingMessages: number;
  /** The in-flight turn's correlation id, or null when idle. */
  activeTurnId: string | null;
}

export type TurnCompletionStatus = 'completed' | 'aborted' | 'error';

export interface TurnCompletion {
  turnId: string;
  status: TurnCompletionStatus;
}

/**
 * Two send methods, not one — they map 1:1 onto the two existing AgentSession
 * APIs (`sendUserMessage` / `sendCustomMessage`), which have different payload
 * shapes and turn semantics and must not be collapsed.
 */
export interface AppRuntimeSessionHost {
  /** Resolve the workspace's active session (streaming first, else most recent). */
  getActiveForWorkspace(workspaceId: string): Promise<ActiveSession | null>;

  /** Read idle/pending/active-turn state for a session. Throws if unknown. */
  getState(sessionId: string): Promise<SessionState>;

  /**
   * User-visible steer / follow-up; wraps `session.sendUserMessage`. Always
   * triggers a turn. Resolves with the correlation id of the turn it started.
   * `source` tags the origin for diagnostics; it is not forwarded to the SDK.
   */
  sendUserSteer(
    sessionId: string,
    content: ExtensionRuntimeContent,
    options: { deliverAs: 'steer' | 'followUp'; source: string },
  ): Promise<{ turnId: string }>;

  /**
   * Inject a context message; wraps `session.sendCustomMessage`. Triggers a
   * turn only when `triggerTurn` is true — `turnId` is null otherwise.
   */
  sendContextMessage(
    sessionId: string,
    message: ExtensionRuntimeMessage,
    options: {
      deliverAs: 'steer' | 'followUp' | 'nextTurn';
      triggerTurn: boolean;
      source: string;
    },
  ): Promise<{ turnId: string | null }>;

  /**
   * Observe turn completion for a session, correlated by `turnId`. Fires once
   * per agent loop (the id is stable across the loop's internal LLM turns).
   * Returns an unsubscribe function.
   */
  onTurnComplete(
    sessionId: string,
    cb: (completion: TurnCompletion) => void,
  ): () => void;
}
