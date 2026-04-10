/**
 * Agent checkpoint restore — extracted from agent.ts to keep that file
 * under 500 LOC and to follow the same delegation pattern used by
 * agent-model-context.ts.
 */

import { ipcMain } from 'electron';
import type { AgentSession } from '@mariozechner/pi-coding-agent';

import { IpcChannels } from '@/types/ipc';
import type { ChatMessage, AgentStreamEvent } from '@/types/ipc';
import type { ChatCheckpointRef } from '@/types/checkpoints';
import {
  convertSessionMessages,
  buildCheckpointMapByTurn,
  findCheckpointEntryId,
} from './agent-helpers';
import { vcsManager } from '@electron/shared/infra/shared-infra';

// ── Types ───────────────────────────────────────────────────

export interface AgentPoolCheckpointEntry {
  session: AgentSession;
  workspaceId: string;
  lastCompletedCheckpoint: ChatCheckpointRef | null;
}

interface RegisterCheckpointHandlersOptions {
  getEntry: (sessionId: string) => AgentPoolCheckpointEntry | undefined;
  sendEvent: (event: AgentStreamEvent) => void;
}

// ── Handler registration ────────────────────────────────────

export function registerAgentCheckpointHandlers(
  opts: RegisterCheckpointHandlersOptions,
): void {
  ipcMain.handle(
    IpcChannels.agent.restoreToCheckpoint,
    async (_event, sessionId: string, changeId: string): Promise<ChatMessage[]> => {
      const entry = opts.getEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      if (entry.session.agent.state.isStreaming) {
        throw new Error('Cannot restore while agent is streaming');
      }

      // 1. Restore filesystem via VCS
      await vcsManager.restoreCheckpoint(entry.workspaceId, changeId);

      // 2. Branch session tree to the checkpoint entry. With the shifted
      //    mapping (user message N carries checkpoint from turn N-1),
      //    the checkpoint entry is the last entry of turn N-1. Branching
      //    to it keeps turns 0..N-1 visible and hides turn N onward.
      const branchTargetId = findCheckpointEntryId(entry.session, changeId);
      if (branchTargetId) {
        entry.session.sessionManager.branch(branchTargetId);
        const ctx = entry.session.sessionManager.buildSessionContext();
        entry.session.agent.replaceMessages(ctx.messages);
      } else {
        console.warn(`[checkpoint] No session entry for changeId=${changeId} — VCS-only restore`);
      }

      // 3. Clear any stale checkpoint so it isn't attached to the next message
      entry.lastCompletedCheckpoint = null;

      // 4. Rebuild and send updated messages to the renderer
      const chatMessages = convertSessionMessages(
        entry.session.messages,
        buildCheckpointMapByTurn(entry.session, entry.workspaceId),
      );
      opts.sendEvent({ type: 'messages_loaded', sessionId, messages: chatMessages });

      return chatMessages;
    },
  );
}
