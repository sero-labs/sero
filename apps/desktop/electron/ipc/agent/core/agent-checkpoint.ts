/**
 * Agent checkpoint and turn-undo restore handlers.
 */

import { ipcMain } from 'electron';
import type { AgentSession } from '@mariozechner/pi-coding-agent';

import { IpcChannels } from '@/types/ipc-channels';
import type { AgentStreamEvent, ChatMessage, ChatTurnUndoRef } from '@/types/ipc';
import {
  buildTurnUndoMapByTurn,
  convertSessionMessages,
  findLegacyTurnUndoEntryId,
  nextId,
} from './agent-helpers';
import { vcsManager } from '@electron/shared/infra/shared-infra';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';

export interface AgentPoolCheckpointEntry {
  session: AgentSession;
  workspaceId: string;
  pendingTurnUndoUserMessageId: string | null;
}

interface RegisterCheckpointHandlersOptions {
  getEntry: (sessionId: string) => AgentPoolCheckpointEntry | undefined;
  sendEvent: (event: AgentStreamEvent) => void;
}

interface UndoToTurnArgs {
  entry: AgentPoolCheckpointEntry;
  sessionId: string;
  turnUndo: ChatTurnUndoRef;
  sendEvent: (event: AgentStreamEvent) => void;
}

function rebuildMessages(
  entry: AgentPoolCheckpointEntry,
  sessionId: string,
  sendEvent: (event: AgentStreamEvent) => void,
): ChatMessage[] {
  const chatMessages = convertSessionMessages(
    entry.session.messages,
    buildTurnUndoMapByTurn(entry.session, entry.workspaceId),
  );
  sendEvent({ type: 'messages_loaded', sessionId, messages: chatMessages });
  return chatMessages;
}

function assertCanRestore(entry: AgentPoolCheckpointEntry | undefined, sessionId: string) {
  if (!entry) throw new Error(`No active session: ${sessionId}`);
  if (entry.session.agent.state.isStreaming) {
    throw new Error('Cannot restore while agent is streaming');
  }
  return entry;
}

export async function undoToTurn({
  entry,
  sessionId,
  turnUndo,
  sendEvent,
}: UndoToTurnArgs): Promise<ChatMessage[]> {
  if (turnUndo.workspaceId !== entry.workspaceId) {
    throw new Error('Turn undo does not belong to the active workspace');
  }

  await vcsManager.restoreCheckpoint(entry.workspaceId, turnUndo.snapshotId);
  void gitWorkspaceStateManager.refreshWorkspace(entry.workspaceId);

  const result = await entry.session.navigateTree(turnUndo.targetUserEntryId, {
    summarize: false,
  });
  if (result.cancelled) {
    throw new Error('Turn undo was cancelled');
  }

  entry.pendingTurnUndoUserMessageId = null;
  const chatMessages = rebuildMessages(entry, sessionId, sendEvent);

  if (typeof result.editorText === 'string' && result.editorText.length > 0) {
    sendEvent({
      type: 'composer_prefill',
      sessionId,
      prefill: {
        requestId: nextId(),
        text: result.editorText,
        source: 'turn-undo',
      },
    });
  }

  return chatMessages;
}

async function restoreLegacyCheckpoint(
  entry: AgentPoolCheckpointEntry,
  sessionId: string,
  changeId: string,
  sendEvent: (event: AgentStreamEvent) => void,
): Promise<ChatMessage[]> {
  await vcsManager.restoreCheckpoint(entry.workspaceId, changeId);
  void gitWorkspaceStateManager.refreshWorkspace(entry.workspaceId);

  const branchTargetId = findLegacyTurnUndoEntryId(entry.session, changeId);
  if (branchTargetId) {
    entry.session.sessionManager.branch(branchTargetId);
    const ctx = entry.session.sessionManager.buildSessionContext();
    entry.session.agent.replaceMessages(ctx.messages);
  } else {
    console.warn(`[checkpoint] No session entry for changeId=${changeId} — VCS-only restore`);
  }

  entry.pendingTurnUndoUserMessageId = null;
  return rebuildMessages(entry, sessionId, sendEvent);
}

export function registerAgentCheckpointHandlers(
  opts: RegisterCheckpointHandlersOptions,
): void {
  ipcMain.handle(
    IpcChannels.agent.undoToTurn,
    async (_event, sessionId: string, turnUndo: ChatTurnUndoRef): Promise<ChatMessage[]> => {
      const entry = assertCanRestore(opts.getEntry(sessionId), sessionId);
      return undoToTurn({ entry, sessionId, turnUndo, sendEvent: opts.sendEvent });
    },
  );

  ipcMain.handle(
    IpcChannels.agent.restoreToCheckpoint,
    async (_event, sessionId: string, changeId: string): Promise<ChatMessage[]> => {
      const entry = assertCanRestore(opts.getEntry(sessionId), sessionId);
      return restoreLegacyCheckpoint(entry, sessionId, changeId, opts.sendEvent);
    },
  );
}
