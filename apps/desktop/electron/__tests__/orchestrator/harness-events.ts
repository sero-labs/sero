// Event-source fakes for the event-router tests, split out of the harness to keep
// it under the 500-LOC limit: the active-session host (turn emitter) and the
// non-session vcs/workspace seams (`host.git.onCommit` / `host.workspace.onChange`),
// each with a control to emit events and inspect live subscriber counts.

import type {
  ActiveSession,
  AppRuntimeCommitEvent,
  AppRuntimeGitApi,
  AppRuntimeSessionHost,
  AppRuntimeWorkspaceApi,
  AppRuntimeWorkspaceChangeEvent,
  ExtensionRuntimeContent,
  SessionState,
  TurnCompletion,
  TurnCompletionStatus,
  VcsCheckpointSource,
} from '@sero-ai/common';

// Type-only imports (erased at runtime) — the runtime edge is harness → here, so
// these never form a runtime cycle.
import type { FakeGitWorld, SessionControl, SessionOptions } from './harness';

/** Drives vcs/workspace events for event-router tests (Phase 6 non-session seams). */
export interface WorkspaceEventControl {
  /** Fire `host.git.onCommit` for every subscriber. */
  emitCommit(changeId?: string, source?: VcsCheckpointSource): void;
  /** Fire `host.workspace.onChange` for every subscriber. */
  emitChange(directories: string[]): void;
  /** Live `onCommit` / `onChange` subscriber counts (assert subscribe/drop). */
  commitListenerCount(): number;
  changeListenerCount(): number;
}

export interface WorkspaceEventFakes {
  control: WorkspaceEventControl;
  /** `host.git.onCommit` fragment. */
  onCommit: AppRuntimeGitApi['onCommit'];
  /** `host.workspace.onChange` fragment. */
  onChange: AppRuntimeWorkspaceApi['onChange'];
}

export function makeWorkspaceEvents(workspaceId: string): WorkspaceEventFakes {
  const commitListeners = new Set<(event: AppRuntimeCommitEvent) => void>();
  const changeListeners = new Set<(event: AppRuntimeWorkspaceChangeEvent) => void>();
  return {
    control: {
      emitCommit: (changeId = 'commit-1', source = 'manual') => {
        for (const cb of [...commitListeners]) cb({ workspaceId, changeId, source });
      },
      emitChange: (directories) => {
        for (const cb of [...changeListeners]) cb({ workspaceId, directories });
      },
      commitListenerCount: () => commitListeners.size,
      changeListenerCount: () => changeListeners.size,
    },
    onCommit: (_workspaceId, cb) => {
      commitListeners.add(cb);
      return () => commitListeners.delete(cb);
    },
    onChange: (_workspaceId, cb) => {
      changeListeners.add(cb);
      return () => changeListeners.delete(cb);
    },
  };
}

/**
 * Fake `host.session` for active-session / hybrid / event tests. A steered turn
 * runs the `steer` script (mutating the same git world the post-turn diff is
 * measured against), then emits its completion on a macrotask so the adapter's
 * subscribe-before-send observation matches by turn id. Tests can also emit a
 * turn completion directly via the returned {@link SessionControl} to exercise
 * session event triggers (Phase 5).
 */
export function makeSessionHost(
  config: SessionOptions | undefined,
  world: FakeGitWorld,
  workspaceId: string,
): { host: AppRuntimeSessionHost; control: SessionControl } {
  const cfg = config ?? {};
  const fallback: ActiveSession = { sessionId: 'live-session', workspaceId };
  const active = cfg.active === undefined ? fallback : cfg.active;
  const state: SessionState = cfg.state ?? { idle: true, pendingMessages: 0, activeTurnId: null };
  const listeners = new Set<(completion: TurnCompletion) => void>();
  let turnSeq = 0;

  const emit = (turnId: string, status: TurnCompletionStatus): void => {
    for (const cb of [...listeners]) cb({ turnId, status });
  };

  const triggerTurn = async (content: ExtensionRuntimeContent): Promise<string> => {
    const turnId = `turn-${++turnSeq}`;
    const result = (await cfg.steer?.(content, world)) ?? {};
    if (result.changedFiles) world.changed = [...result.changedFiles];
    if (result.diff !== undefined) world.diff = result.diff;
    const status: TurnCompletionStatus = result.status ?? 'completed';
    // Emit on a macrotask so the completion lands AFTER `sendUserSteer` resolves
    // (mirroring the real seam: turn_start returns the id, agent_end fires later).
    // This lets the adapter tag the turn id before any listener sees the
    // completion — the Phase 5 self-retrigger guard relies on that ordering.
    setTimeout(() => emit(turnId, status), 0);
    return turnId;
  };

  const host: AppRuntimeSessionHost = {
    async getActiveForWorkspace() {
      return active;
    },
    async getState() {
      return state;
    },
    async sendUserSteer(_sessionId, content) {
      return { turnId: await triggerTurn(content) };
    },
    async sendContextMessage(_sessionId, message, options) {
      return { turnId: options.triggerTurn ? await triggerTurn(message.content) : null };
    },
    onTurnComplete(_sessionId, cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  const control: SessionControl = {
    emitTurn: (turnId, status = 'completed') => emit(turnId, status),
    listenerCount: () => listeners.size,
  };

  return { host, control };
}
