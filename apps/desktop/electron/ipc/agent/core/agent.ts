import { ipcMain } from 'electron';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  AgentStreamEvent,
  ChatAttachment,
  ChatMessage,
  CompactResult,
  ContextUsageInfo,
  SeroSessionInfo,
  SeroSlashCommandInfo,
  SessionUsageStats,
} from '@/types/ipc';
import {
  buildModelState,
  buildTurnUndoMapByTurn,
  buildCommandList,
  convertSessionMessages,
  readHiddenCommands,
} from './agent-helpers';
import { handlePromptInput, handleSteerInput } from './agent-prompt';
import { emitSessionShutdown, emitSessionBeforeSwitch } from './agent-session-events';
import { registerAgentCheckpointHandlers } from './agent-checkpoint';
import { workspaceManager } from '@electron/features/workspace/manager';
import {
  subagentManager,
  SERO_CONFIG_PATH,
  SERO_SESSION_DIR,
} from '@electron/shared/infra/shared-infra';
import { registerAgentModelContextHandlers } from './agent-model-context';
import { installCliAgentBridge, noteCliTurnEnd } from '@electron/cli/bridges';
import { clearBridgedExtensionSessionStateForSession } from '@electron/cli';
import { installGatewayAgentOps } from '@electron/features/gateway/bridge/agent-bridge';
import { buildGatewayOps } from '@electron/ipc/gateway/gateway-ops';
import { emitAgentEvent } from './agent-event-broadcast';
import { openSessionInPool, type PoolEntry } from './agent-session-open';

export { emitAgentEvent } from './agent-event-broadcast';
const pool = new Map<string, PoolEntry>();

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
/** Get a pool entry by session ID (used by collaboration handler). */
export function getAgentPoolEntry(sessionId: string): PoolEntry | undefined {
  return pool.get(sessionId);
}
export function getAgentPoolEntries(): Array<[string, PoolEntry]> {
  return [...pool.entries()];
}
if (process.env.NODE_ENV === 'test') {
  (globalThis as Record<string, unknown>).__seroTestGetAgentPoolEntry = getAgentPoolEntry;
}
/** Reload all active session runtimes after resource/package edits. */
export async function reloadAllSessionResources(): Promise<void> {
  await Promise.all([...pool.entries()].map(async ([sessionId, entry]) => {
    await entry.session.reload();
    sendEvent({
      type: 'model_change',
      sessionId,
      state: buildModelState(entry),
    });
  }));
}
function sendEvent(event: AgentStreamEvent): void {
  emitAgentEvent(event);
}
async function closePoolEntry(sessionId: string): Promise<void> {
  const entry = pool.get(sessionId);
  if (!entry) return;
  noteCliTurnEnd(sessionId);

  // Fire session_shutdown so extensions (e.g. memory) can export transcripts
  // and run cleanup. The SDK's dispose() does NOT fire this event.
  try {
    await emitSessionShutdown(entry.session);
  } catch (err) {
    console.error(`[agent] session_shutdown failed for ${sessionId}:`, err);
  }

  entry.unsubscribe();
  entry.session.dispose();
  pool.delete(sessionId);
  clearBridgedExtensionSessionStateForSession(sessionId);
}

export async function disposeAllAgentSessions(): Promise<void> {
  await Promise.allSettled([...pool.keys()].map((sessionId) => closePoolEntry(sessionId)));
}

/** Open (or return) an agent session — shared by IPC handler and gateway. */
async function openSessionInternal(
  sessionId: string,
  sessionPath: string,
  workspaceId: string,
): Promise<ChatMessage[]> {
  return openSessionInPool({
    pool,
    sessionId,
    sessionPath,
    workspaceId,
    sendEvent,
    closeExisting: closePoolEntry,
  });
}

export function registerAgentHandlers(): void {
  installCliAgentBridge({
    getEntry: (id) => pool.get(id),
    listEntries: () => [...pool.entries()],
    sendEvent,
  });

  // ── Gateway agent bridge ─────────────────────────────────
  installGatewayAgentOps(buildGatewayOps(pool, openSessionInternal));

  ipcMain.handle(
    IpcChannels.agent.open,
    async (_e, sessionId: string, sessionPath: string, workspaceId: string) =>
      openSessionInternal(sessionId, sessionPath, workspaceId),
  );

  ipcMain.handle(
    IpcChannels.agent.prompt,
    async (
      _event,
      sessionId: string,
      text: string,
      attachments?: ChatAttachment[],
      clientMessageId?: string,
    ): Promise<void> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await handlePromptInput({
        entry,
        sessionId,
        text,
        attachments,
        clientMessageId,
        sendEvent,
      });
    },
  );
  ipcMain.handle(
    IpcChannels.agent.steer,
    async (
      _event,
      sessionId: string,
      text: string,
      clientMessageId?: string,
    ): Promise<void> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      await handleSteerInput({
        entry,
        sessionId,
        text,
        clientMessageId,
        sendEvent,
      });
    },
  );
  ipcMain.handle(
    IpcChannels.agent.abort,
    async (_event, sessionId: string): Promise<void> => {
      const entry = pool.get(sessionId);
      if (entry) {
        await entry.session.abort();
        // Cascade abort to any running subagents spawned by this session
        subagentManager.abortAll(sessionId);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.agent.close,
    async (_event, sessionId: string): Promise<void> => {
      await closePoolEntry(sessionId);
    },
  );

  // Notify that the user switched away from a session. Fires
  // session_before_switch so extensions can export transcripts.
  ipcMain.handle(
    IpcChannels.agent.notifySessionSwitch,
    async (
      _event,
      previousSessionId: string,
      reason: 'new' | 'resume' = 'resume',
    ): Promise<void> => {
      const entry = pool.get(previousSessionId);
      if (!entry) return;
      try {
        await emitSessionBeforeSwitch(entry.session, reason);
      } catch (err) {
        console.error(`[agent] session_before_switch failed for ${previousSessionId}:`, err);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.agent.getCommands,
    async (_event, sessionId: string): Promise<SeroSlashCommandInfo[]> => {
      const entry = pool.get(sessionId);
      if (!entry) return [];
      const hidden = await readHiddenCommands(SERO_CONFIG_PATH);
      return buildCommandList(entry, hidden);
    },
  );

  ipcMain.handle(
    IpcChannels.agent.reloadResources,
    async (_event, sessionId: string): Promise<SeroSlashCommandInfo[]> => {
      const entry = pool.get(sessionId);
      if (!entry) return [];
      await entry.loader.reload();

      const hidden = await readHiddenCommands(SERO_CONFIG_PATH);
      return buildCommandList(entry, hidden);
    },
  );

  ipcMain.handle(
    IpcChannels.agent.getUsage,
    async (_event, sessionId: string): Promise<SessionUsageStats | null> => {
      const entry = pool.get(sessionId);
      if (!entry) return null;

      const stats = entry.session.getSessionStats();
      return {
        tokens: stats.tokens,
        cost: stats.cost,
        requestCount: stats.userMessages,
      };
    },
  );

  ipcMain.handle(
    IpcChannels.agent.getContextUsage,
    async (_event, sessionId: string): Promise<ContextUsageInfo | null> => {
      const entry = pool.get(sessionId);
      if (!entry) return null;
      return entry.session.getContextUsage() ?? null;
    },
  );

  // ── Manual compaction ────────────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.compact,
    async (_event, sessionId: string, customInstructions?: string): Promise<CompactResult> => {
      const entry = pool.get(sessionId);
      if (!entry) return { success: false, error: 'No active session' };

      try {
        const result = await entry.session.compact(customInstructions);
        return { success: true, tokensBefore: result.tokensBefore };
      } catch (err: unknown) {
        return { success: false, error: toErrorMessage(err, 'Compaction failed') };
      }
    },
  );

  ipcMain.handle(
    IpcChannels.agent.clearSession,
    async (_event, sessionId: string): Promise<ChatMessage[]> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      if (entry.session.agent.state.isStreaming) {
        throw new Error('Cannot clear while agent is streaming');
      }

      const sm = entry.session.sessionManager;
      const branch = sm.getBranch();
      if (branch.length === 0) {
        return convertSessionMessages(
          entry.session.messages,
          buildTurnUndoMapByTurn(entry.session, entry.workspaceId),
        );
      }

      // Use the SDK's navigateTree which fires session_before_tree /
      // session_tree extension events.  Navigating to the first entry
      // (a user message with parentId=null) causes the SDK to call
      // resetLeaf(), fully clearing the conversation context.
      const rootId = branch[0].id;
      const result = await entry.session.navigateTree(rootId, { summarize: false });
      if (result.cancelled) {
        throw new Error('Clear was cancelled by an extension');
      }
      entry.pendingTurnUndoUserMessageId = null;

      const chatMessages = convertSessionMessages(
        entry.session.messages,
        buildTurnUndoMapByTurn(entry.session, entry.workspaceId),
      );
      sendEvent({ type: 'messages_loaded', sessionId, messages: chatMessages });

      return chatMessages;
    },
  );

  // Fork session — extract branch to new file ("fork & stay")
  ipcMain.handle(
    IpcChannels.agent.forkSession,
    async (_event, sessionId: string): Promise<SeroSessionInfo> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      if (entry.session.agent.state.isStreaming) {
        throw new Error('Cannot fork while agent is streaming');
      }

      const sm = entry.session.sessionManager;
      const leafId = sm.getLeafId();
      if (!leafId) throw new Error('Session has no entries to fork');

      const newSessionPath = sm.createBranchedSession(leafId);
      if (!newSessionPath) throw new Error('Failed to create forked session file');

      // Read metadata from the new session file (not fabricated timestamps)
      const newSm = SessionManager.open(newSessionPath, SERO_SESSION_DIR);
      const header = newSm.getHeader();
      if (!header) throw new Error('Forked session has no header');
      const branch = newSm.getBranch();

      return {
        path: newSessionPath,
        id: newSm.getSessionId(),
        cwd: header.cwd,
        workspaceId: entry.workspaceId,
        name: newSm.getSessionName(),
        created: header.timestamp,
        modified: header.timestamp,
        messageCount: branch.filter(
          (e) => e.type === 'message' && e.message.role === 'user',
        ).length,
        firstMessage: '',
      };
    },
  );
  ipcMain.handle(
    IpcChannels.sessions.rename,
    async (_event, sessionId: string, name: string): Promise<void> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      entry.session.setSessionName(name);
      entry.lastSessionName = name;
      sendEvent({ type: 'session_name', sessionId, name });
    },
  );

  registerAgentCheckpointHandlers({
    getEntry: (sessionId) => pool.get(sessionId),
    sendEvent,
  });

  registerAgentModelContextHandlers({
    getEntry: (sessionId) => pool.get(sessionId),
    sendEvent,
  });
}
