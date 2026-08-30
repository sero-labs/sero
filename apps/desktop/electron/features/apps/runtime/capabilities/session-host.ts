/**
 * Active-session host seam for background app runtimes (Orchestrator
 * active-session steps). Wraps the CLI session bridge so a background runtime
 * can find the active session, read its state, send a steer/context message,
 * and observe turn completion by turnId.
 *
 * The live session keeps operating under normal Sero session rules; this seam
 * only sends and observes.
 */

import type {
  AppRuntimeSessionHost,
  ExtensionRuntimeContent,
} from '@sero-ai/common';
import { getCliSessionBridge, onCliTurnComplete } from '@electron/cli/bridges';

function toPiContent(content: ExtensionRuntimeContent): string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
  if (typeof content === 'string') return content;
  return content.map((block) =>
    block.type === 'text'
      ? { type: 'text' as const, text: block.text }
      : { type: 'image' as const, data: block.data, mimeType: block.mimeType },
  );
}

export function createSessionHost(): AppRuntimeSessionHost {
  return {
    async getActiveForWorkspace(workspaceId, sessionPath) {
      const bridge = getCliSessionBridge();
      const entry = sessionPath
        ? bridge.getSessionForPath?.(workspaceId, sessionPath)
        : bridge.getActiveSessionForWorkspace(workspaceId);
      if (!entry) return null;
      const resolvedPath = entry.session.sessionManager.getSessionFile();
      return resolvedPath ? { sessionId: entry.sessionId, workspaceId: entry.workspaceId, sessionPath: resolvedPath } : null;
    },

    async getState(sessionId) {
      const bridge = getCliSessionBridge();
      const entry = bridge.getSessionEntry(sessionId);
      if (!entry) return { idle: true, pendingMessages: 0, activeTurnId: null };
      return {
        idle: !entry.session.isStreaming,
        pendingMessages: entry.session.pendingMessageCount,
        activeTurnId: bridge.getActiveTurnId(sessionId),
      };
    },

    async sendUserSteer(sessionId, content, options) {
      const bridge = getCliSessionBridge();
      const entry = bridge.getSessionEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await entry.session.sendUserMessage(toPiContent(content), { deliverAs: options.deliverAs });
      // Return the real active turn id when one is observable, else null. The
      // observer (active-session executor) treats a concrete id as the turn to
      // match and null as "observe the next completion" — never a synthesized id
      // that could never match a real completion event.
      return { turnId: bridge.getActiveTurnId(sessionId) };
    },

    async sendContextMessage(sessionId, message, options) {
      const bridge = getCliSessionBridge();
      const entry = bridge.getSessionEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await entry.session.sendCustomMessage(
        { customType: message.customType, content: message.content, display: message.display, details: message.details },
        { triggerTurn: options.triggerTurn, deliverAs: options.deliverAs },
      );
      if (!options.triggerTurn) return { turnId: null };
      return { turnId: bridge.getActiveTurnId(sessionId) };
    },

    onTurnComplete(sessionId, cb) {
      return onCliTurnComplete(sessionId, cb);
    },
  };
}
