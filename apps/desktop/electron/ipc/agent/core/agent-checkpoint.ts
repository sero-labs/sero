/**
 * Agent checkpoint and turn-undo restore handlers.
 */

import { ipcMain } from 'electron';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

import { IpcChannels } from '@/types/ipc-channels';
import type { AgentStreamEvent, ChatHistoryPage, ChatTurnUndoRef } from '@/types/ipc';
import { findLegacyTurnUndoEntryId, nextId } from './agent-helpers';
import { readNewestTurns } from './agent-history-window';
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
): ChatHistoryPage {
  const page = readNewestTurns(entry.session, entry.workspaceId);
  sendEvent({ type: 'messages_loaded', sessionId, ...page });
  return page;
}

function assertCanRestore(entry: AgentPoolCheckpointEntry | undefined, sessionId: string) {
  if (!entry) throw new Error(`No active session: ${sessionId}`);
  if (entry.session.agent.state.isStreaming) {
    throw new Error('Cannot restore while agent is streaming');
  }
  return entry;
}

async function rollbackTreeNavigation(
  entry: AgentPoolCheckpointEntry,
  previousLeafId: string | null,
  targetUserEntryId: string,
): Promise<void> {
  if (!previousLeafId || previousLeafId === targetUserEntryId) return;

  try {
    const rollback = await entry.session.navigateTree(previousLeafId, {
      summarize: false,
    });
    if (rollback.cancelled) {
      console.warn(
        `[turn-undo] Failed to roll back cancelled restore navigation for workspace=${entry.workspaceId}: rollback navigation was cancelled`,
      );
    }
  } catch (error) {
    console.warn(
      `[turn-undo] Failed to roll back restore navigation for workspace=${entry.workspaceId}:`,
      error,
    );
  }
}

export async function undoToTurn({
  entry,
  sessionId,
  turnUndo,
  sendEvent,
}: UndoToTurnArgs): Promise<ChatHistoryPage> {
  if (turnUndo.workspaceId !== entry.workspaceId) {
    throw new Error('Turn undo does not belong to the active workspace');
  }

  console.log(
    `[turn-undo] Undo requested for session=${sessionId}, workspace=${entry.workspaceId}, snapshot=${turnUndo.snapshotId}, userEntry=${turnUndo.targetUserEntryId}`,
  );

  const previousLeafId = entry.session.sessionManager.getLeafId?.() ?? null;
  const result = await entry.session.navigateTree(turnUndo.targetUserEntryId, {
    summarize: false,
  });
  if (result.cancelled) {
    throw new Error('Turn undo was cancelled');
  }

  try {
    await vcsManager.restoreCheckpoint(entry.workspaceId, turnUndo.snapshotId);
  } catch (error) {
    await rollbackTreeNavigation(entry, previousLeafId, turnUndo.targetUserEntryId);
    throw error;
  }
  gitWorkspaceStateManager.invalidateWorkspace(entry.workspaceId, 'turn-undo:restore', { delayMs: 0 });

  entry.pendingTurnUndoUserMessageId = null;
  const chatMessages = rebuildMessages(entry, sessionId, sendEvent);

  console.log(
    `[turn-undo] Session tree navigated for session=${sessionId}; cancelled=${result.cancelled ? 'yes' : 'no'}, editorText=${typeof result.editorText === 'string' ? 'present' : 'missing'}`,
  );

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
): Promise<ChatHistoryPage> {
  console.log(
    `[checkpoint] Legacy restore requested for session=${sessionId}, workspace=${entry.workspaceId}, checkpoint=${changeId}`,
  );
  await vcsManager.restoreCheckpoint(entry.workspaceId, changeId);
  gitWorkspaceStateManager.invalidateWorkspace(entry.workspaceId, 'checkpoint:restore', { delayMs: 0 });

  const branchTargetId = findLegacyTurnUndoEntryId(entry.session, changeId);
  if (branchTargetId) {
    entry.session.sessionManager.branch(branchTargetId);
    const ctx = entry.session.sessionManager.buildSessionContext();
    entry.session.agent.state.messages = ctx.messages;
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
    async (_event, sessionId: string, turnUndo: ChatTurnUndoRef): Promise<ChatHistoryPage> => {
      const entry = assertCanRestore(opts.getEntry(sessionId), sessionId);
      return undoToTurn({ entry, sessionId, turnUndo, sendEvent: opts.sendEvent });
    },
  );

  ipcMain.handle(
    IpcChannels.agent.restoreToCheckpoint,
    async (_event, sessionId: string, changeId: string): Promise<ChatHistoryPage> => {
      const entry = assertCanRestore(opts.getEntry(sessionId), sessionId);
      return restoreLegacyCheckpoint(entry, sessionId, changeId, opts.sendEvent);
    },
  );
}
