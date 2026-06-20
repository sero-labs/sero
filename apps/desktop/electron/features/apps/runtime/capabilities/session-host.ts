/**
 * Active-session host capability — the desktop-core implementation of the new
 * `host.session` seam (specs/02-integration-seams.md §New seam).
 *
 * It wraps the existing CLI session bridge (resolve/idle/pending/send) and the
 * agent bridge's turn-lifecycle observers (the genuinely-new part) so background
 * runtime code can safely re-wake a workspace's live session and observe the
 * resulting turn. The bridge is resolved lazily per call — it is installed once
 * the agent IPC layer is up, which may be after the host object is built.
 */

import type { AppRuntimeSessionHost } from '@sero-ai/common';
import { getCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { onCliTurnComplete, waitForCliTurnStart } from '@electron/cli/bridges/agent-bridge';
import type { CliSessionEntry } from '@electron/cli/bridges/session-bridge';

// How long to wait for the triggered turn's `turn_start` before falling back to
// the bridge's current active-turn id. Generous: the cap only matters if a turn
// never starts (e.g. the message was queued behind a busy session).
const TURN_START_TIMEOUT_MS = 10_000;

function requireEntry(sessionId: string): CliSessionEntry {
  const entry = getCliSessionBridge().getSessionEntry(sessionId);
  if (!entry) throw new Error(`No active session: ${sessionId}`);
  return entry;
}

export function createSessionHost(): AppRuntimeSessionHost {
  return {
    async getActiveForWorkspace(workspaceId) {
      const entry = getCliSessionBridge().getActiveSessionForWorkspace(workspaceId);
      if (!entry) return null;
      return { sessionId: entry.sessionId, workspaceId: entry.workspaceId, title: entry.lastSessionName };
    },

    async getState(sessionId) {
      const bridge = getCliSessionBridge();
      const entry = requireEntry(sessionId);
      const activeTurnId = bridge.getActiveTurnId(sessionId);
      return {
        idle: !entry.session.agent.state.isStreaming && activeTurnId === null,
        pendingMessages: entry.session.pendingMessageCount,
        activeTurnId,
      };
    },

    async sendUserSteer(sessionId, content, options) {
      const entry = requireEntry(sessionId);
      // Subscribe to the next turn start *before* sending so we never miss it.
      const turnIdPromise = waitForCliTurnStart(sessionId, TURN_START_TIMEOUT_MS);
      await entry.session.sendUserMessage(content, { deliverAs: options.deliverAs });
      const turnId = (await turnIdPromise) ?? getCliSessionBridge().getActiveTurnId(sessionId);
      if (!turnId) throw new Error('Steer delivered but no turn started.');
      return { turnId };
    },

    async sendContextMessage(sessionId, message, options) {
      const entry = requireEntry(sessionId);
      const turnIdPromise = options.triggerTurn
        ? waitForCliTurnStart(sessionId, TURN_START_TIMEOUT_MS)
        : null;
      await entry.session.sendCustomMessage(message, {
        triggerTurn: options.triggerTurn,
        deliverAs: options.deliverAs,
      });
      if (!turnIdPromise) return { turnId: null };
      const turnId = (await turnIdPromise) ?? getCliSessionBridge().getActiveTurnId(sessionId);
      return { turnId };
    },

    onTurnComplete(sessionId, cb) {
      return onCliTurnComplete(sessionId, cb);
    },
  };
}
