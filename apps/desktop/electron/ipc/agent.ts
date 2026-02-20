import { ipcMain, BrowserWindow } from 'electron';
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  createCodingTools,
  type AgentSession,
  type SlashCommandInfo,
} from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import { promises as fs } from 'fs';
import path from 'path';

import { IpcChannels } from '../../src/types/ipc';
import type {
  ChatMessage,
  ChatAttachment,
  ChatAssistantMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionUsageStats,
  ContextOverrides,
} from '../../src/types/ipc';
import type { ChatCheckpointRef } from '../../src/types/checkpoints';

import {
  nextId,
  formatCustomMessage,
  convertSessionMessages,
  buildCheckpointMapByTurn,
  findCheckpointEntryId,
  attachmentsToImages,
  readHiddenCommands,
  buildCommandList,
} from './agent-helpers';
import { logRawEvent, logTurnContext } from './debug';
import { workspaceManager } from '../workspace';
import { createSeroExtensionFactory } from '../sero-extension';
import { SERO_AGENT_DIR } from '../env';
import {
  ensureInfra,
  containerManager,
  vcsManager,
  buildContainerConfig,
  SERO_SESSION_DIR,
  SERO_CONFIG_PATH,
} from './shared-infra';
import { createContainerTools } from '../container/tools';
import type { ContainerState } from '../container/index';
import { registerAgentModelContextHandlers } from './agent-model-context';

interface PoolEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
  unsubscribe: () => void;
  workspaceId: string;
  currentAssistantId: string | null;
  lastSessionName: string | undefined;
  /** Checkpoint from the most recently completed turn, to attach to the NEXT user message. */
  lastCompletedCheckpoint: ChatCheckpointRef | null;
  contextOverrides: ContextOverrides | null;
  originalToolNames: string[] | null;
}

const pool = new Map<string, PoolEntry>();

function sendEvent(event: AgentStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.agent.event, event);
  }
}

function closePoolEntry(sessionId: string): void {
  const entry = pool.get(sessionId);
  if (!entry) return;
  entry.unsubscribe();
  entry.session.dispose();
  pool.delete(sessionId);
}

function disposeAll(): void {
  for (const sessionId of pool.keys()) {
    closePoolEntry(sessionId);
  }
}

function subscribeToSession(sessionId: string, session: AgentSession): () => void {
  return session.subscribe((event) => {
    const entry = pool.get(sessionId);
    if (!entry) return;

    logRawEvent(sessionId, event);

    if (event.type === 'turn_start') {
      logTurnContext(sessionId, session);
    }

    switch (event.type) {
      case 'agent_start':
        sendEvent({ type: 'agent_start', sessionId });
        break;

      case 'agent_end':
        sendEvent({ type: 'agent_end', sessionId });
        {
          // Store the checkpoint from the just-completed turn so it can be
          // attached to the NEXT user message (shifted-by-one mapping:
          // "restore on message N" → state before message N → end of turn N-1).
          const checkpoints = buildCheckpointMapByTurn(entry.session, entry.workspaceId);
          const userCount = entry.session.messages.filter((m) => m.role === 'user').length;
          const lastTurnIdx = userCount - 1;
          const checkpoint = checkpoints.get(lastTurnIdx);
          if (checkpoint) {
            entry.lastCompletedCheckpoint = checkpoint;
          }
        }
        break;

      case 'message_start': {
        if (event.message.role === 'assistant') {
          const chatMsg: ChatAssistantMessage = {
            type: 'assistant',
            id: nextId(),
            text: '',
            isStreaming: true,
          };
          entry.currentAssistantId = chatMsg.id;
          sendEvent({ type: 'message_start', sessionId, message: chatMsg });
        } else if (event.message.role === 'custom') {
          const prefixed = formatCustomMessage(event.message as any);
          if (!prefixed) break;

          const chatMsg: ChatAssistantMessage = {
            type: 'assistant',
            id: nextId(),
            text: prefixed,
            isStreaming: false,
          };
          sendEvent({ type: 'message_start', sessionId, message: chatMsg });
        }
        break;
      }

      case 'message_update': {
        const ame = event.assistantMessageEvent;
        if (ame.type === 'text_delta' && entry.currentAssistantId) {
          sendEvent({
            type: 'text_delta',
            sessionId,
            messageId: entry.currentAssistantId,
            delta: ame.delta,
          });
        }
        break;
      }

      case 'message_end': {
        if (event.message.role === 'assistant' && entry.currentAssistantId) {
          const textParts = event.message.content.filter(
            (c): c is { type: 'text'; text: string } => c.type === 'text',
          );
          sendEvent({
            type: 'message_end',
            sessionId,
            messageId: entry.currentAssistantId,
            text: textParts.map((c) => c.text).join(''),
          });
          entry.currentAssistantId = null;
        }
        break;
      }

      case 'tool_execution_start': {
        if (event.toolName === 'set_session_title') break;

        const toolMsg: ChatToolCallMessage = {
          type: 'tool',
          id: nextId(),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args ?? {},
          output: null,
          isError: false,
          state: 'running',
        };
        sendEvent({ type: 'tool_start', sessionId, tool: toolMsg });
        break;
      }

      case 'tool_execution_end': {
        if (event.toolName === 'set_session_title') {
          const newName = entry.session.sessionName;
          if (newName && newName !== entry.lastSessionName) {
            entry.lastSessionName = newName;
            sendEvent({ type: 'session_name', sessionId, name: newName });
          }
          break;
        }

        const result = event.result;
        let text: string | null = null;
        if (result?.content && Array.isArray(result.content)) {
          text = result.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n') || null;
        } else if (typeof result === 'string') {
          text = result;
        }
        sendEvent({
          type: 'tool_end',
          sessionId,
          toolCallId: event.toolCallId,
          output: text,
          isError: event.isError,
        });
        break;
      }
    }
  });
}

async function readGlobalAgentsMd(): Promise<{ path: string; content: string } | null> {
  const globalPath = workspaceManager.getPath('global');
  if (!globalPath) return null;

  const filePath = path.join(globalPath, 'AGENTS.md');
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { path: filePath, content };
  } catch {
    return null;
  }
}

export function registerAgentHandlers(): void {
  ipcMain.handle(
    IpcChannels.agent.open,
    async (_event, sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]> => {
      const existing = pool.get(sessionId);
      if (existing) {
        return convertSessionMessages(
          existing.session.messages,
          buildCheckpointMapByTurn(existing.session, existing.workspaceId),
        );
      }

      const infra = await ensureInfra();

      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);

      let containerState: ContainerState | null = null;
      if (!containerEnabled) {
        console.log(`[agent] Container disabled for workspace ${workspaceId}, using host tools`);
      }
      try {
        if (containerEnabled) {
          sendEvent({ type: 'container_starting', sessionId, workspaceId });
          const containerConfig = await buildContainerConfig(workspaceId, wsPath);
          containerState = await containerManager.ensure(containerConfig);
          sendEvent({
            type: 'container_ready',
            sessionId,
            workspaceId,
            ipAddress: containerState.ipAddress,
          });
        }
      } catch (containerErr: any) {
        console.error(`[agent] Container failed for ${workspaceId}:`, containerErr?.message);
        sendEvent({
          type: 'container_error',
          sessionId,
          workspaceId,
          error: containerErr?.message ?? 'Container failed to start',
        });
      }

      const useContainer = !!containerState;
      const containerTools = useContainer
        ? createContainerTools(containerManager, workspaceId)
        : undefined;
      const builtinTools = useContainer ? [] : createCodingTools(wsPath);

      const globalAgentsFile = await readGlobalAgentsMd();

      const loader = new DefaultResourceLoader({
        cwd: wsPath,
        agentDir: SERO_AGENT_DIR,
        settingsManager: infra.settingsManager,
        extensionFactories: [
          createSeroExtensionFactory(
            workspaceManager,
            workspaceId,
            containerState ?? undefined,
          ),
        ],
        ...(globalAgentsFile && {
          agentsFilesOverride: (discovered) => ({
            agentsFiles: [globalAgentsFile, ...discovered.agentsFiles],
          }),
        }),
      });
      await loader.reload();

      const { session } = await createAgentSession({
        cwd: wsPath,
        agentDir: SERO_AGENT_DIR,
        authStorage: infra.authStorage,
        modelRegistry: infra.modelRegistry,
        tools: builtinTools,
        customTools: containerTools,
        resourceLoader: loader,
        sessionManager: SessionManager.open(sessionPath, SERO_SESSION_DIR),
        settingsManager: infra.settingsManager,
      });

      const unsubscribe = subscribeToSession(sessionId, session);
      pool.set(sessionId, {
        session,
        loader,
        unsubscribe,
        workspaceId,
        currentAssistantId: null,
        lastSessionName: session.sessionName,
        lastCompletedCheckpoint: null,
        contextOverrides: null,
        originalToolNames: null,
      });

      return convertSessionMessages(
        session.messages,
        buildCheckpointMapByTurn(session, workspaceId),
      );
    },
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

      const userMessageId = clientMessageId?.trim() || nextId();
      const userMsg: ChatMessage = { type: 'user', id: userMessageId, text, attachments };
      sendEvent({ type: 'message_start', sessionId, message: userMsg });

      // Attach the checkpoint from the PREVIOUS turn to this new user message
      // (shifted-by-one: "restore on this message" means "go back to before it").
      if (entry.lastCompletedCheckpoint) {
        sendEvent({
          type: 'user_checkpoint',
          sessionId,
          userMessageId,
          checkpoint: entry.lastCompletedCheckpoint,
        });
        entry.lastCompletedCheckpoint = null;
      }

      const images = attachmentsToImages(attachments);
      await entry.session.prompt(text, images ? { images } : undefined);
    },
  );

  ipcMain.handle(
    IpcChannels.agent.abort,
    async (_event, sessionId: string): Promise<void> => {
      const entry = pool.get(sessionId);
      if (entry) {
        await entry.session.abort();
      }
    },
  );

  ipcMain.handle(
    IpcChannels.agent.close,
    async (_event, sessionId: string): Promise<void> => {
      closePoolEntry(sessionId);
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
    IpcChannels.agent.restoreToCheckpoint,
    async (_event, sessionId: string, changeId: string): Promise<ChatMessage[]> => {
      const entry = pool.get(sessionId);
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
      sendEvent({ type: 'messages_loaded', sessionId, messages: chatMessages });

      return chatMessages;
    },
  );

  registerAgentModelContextHandlers({
    getEntry: (sessionId) => pool.get(sessionId),
    sendEvent,
  });

  const { app } = require('electron');
  app.on('before-quit', () => {
    disposeAll();
  });
}
