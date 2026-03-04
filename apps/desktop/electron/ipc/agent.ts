import { ipcMain, BrowserWindow } from 'electron';
import { appendFileSync } from 'fs';
import os from 'os';
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  createCodingTools,
  type AgentSession,
  type SlashCommandInfo,
} from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
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
  attachmentsToImages,
  readHiddenCommands,
  buildCommandList,
} from './agent-helpers';
import { logRawEvent, logTurnContext } from './debug';
import { readGlobalAgentsMd } from './global-agents';
import { registerAgentCheckpointHandlers } from './agent-checkpoint';
import { workspaceManager } from '../workspace';
import { createSeroExtensionFactory } from '../sero-extension';
import { SERO_AGENT_DIR } from '../env';
import {
  ensureInfra,
  containerManager,
  buildContainerConfig,
  subagentManager,
  SERO_SESSION_DIR,
  SERO_CONFIG_PATH,
} from './shared-infra';
import { createContainerTools } from '../container/tools';
import type { ContainerState } from '../container/index';
import { registerAgentModelContextHandlers } from './agent-model-context';
import { createSeroUIContext } from '../extension-ui-context';
import { installCliAgentBridge, noteCliTurnEnd, noteCliTurnStart } from '../cli/agent-bridge';
import { createWorkspaceCliTool, bridgeExtensionTools } from '../cli';
import { installGatewayAgentOps, forwardEventToGateway } from '../gateway/agent-bridge';

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
  forwardEventToGateway(event as unknown as Record<string, unknown>);
}

function closePoolEntry(sessionId: string): void {
  const entry = pool.get(sessionId);
  if (!entry) return;
  noteCliTurnEnd(sessionId);
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
      noteCliTurnStart(sessionId);
      logTurnContext(sessionId, session);
    }

    switch (event.type) {
      case 'agent_start':
        sendEvent({ type: 'agent_start', sessionId });
        break;

      case 'agent_end':
        noteCliTurnEnd(sessionId);
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
        } else if (ame.type === 'thinking_delta' && entry.currentAssistantId) {
          sendEvent({
            type: 'thinking_delta',
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
          const thinkingParts = event.message.content.filter(
            (c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking',
          );
          const thinking = thinkingParts.map((c) => c.thinking).join('') || undefined;
          sendEvent({
            type: 'message_end',
            sessionId,
            messageId: entry.currentAssistantId,
            text: textParts.map((c) => c.text).join(''),
            thinking,
          });
          entry.currentAssistantId = null;
        }
        break;
      }

      case 'tool_execution_start': {
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

/** Open (or return) an agent session — shared by IPC handler and gateway. */
async function openSessionInternal(
  sessionId: string, sessionPath: string, workspaceId: string,
): Promise<ChatMessage[]> {
  const existing = pool.get(sessionId);
  if (existing) {
    return convertSessionMessages(
      existing.session.messages,
      buildCheckpointMapByTurn(existing.session, existing.workspaceId),
    );
  }

  const infra = await ensureInfra();
  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);

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
      sendEvent({ type: 'container_ready', sessionId, workspaceId, ipAddress: containerState.ipAddress });
    }
  } catch (containerErr: any) {
    console.error(`[agent] Container failed for ${workspaceId}:`, containerErr?.message);
    sendEvent({ type: 'container_error', sessionId, workspaceId, error: containerErr?.message ?? 'Container failed to start' });
  }

  const useContainer = !!containerState;
  const containerTools = useContainer
    ? createContainerTools(containerManager, workspaceId, sessionId)
    : [createWorkspaceCliTool(workspaceId, sessionId)];
  const builtinTools = useContainer ? [] : createCodingTools(wsPath);
  const globalAgentsFile = await readGlobalAgentsMd(workspaceId);

  const loader = new DefaultResourceLoader({
    cwd: wsPath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    extensionFactories: [
      createSeroExtensionFactory(workspaceManager, workspaceId, sessionId, containerState ?? undefined, {
        subagentManager,
        enableAgentManagementTools: true,
      }),
    ],
    extensionsOverride: bridgeExtensionTools,
    ...(globalAgentsFile && {
      agentsFilesOverride: (discovered: { agentsFiles: Array<{ path: string; content: string }> }) => ({
        agentsFiles: [
          globalAgentsFile,
          ...discovered.agentsFiles.filter((f) => f.path !== globalAgentsFile.path),
        ],
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

  // Provide a real UIContext so extensions get working ctx.ui.notify()
  session.extensionRunner?.setUIContext(createSeroUIContext());

  const unsubscribe = subscribeToSession(sessionId, session);
  pool.set(sessionId, {
    session, loader, unsubscribe, workspaceId,
    currentAssistantId: null,
    lastSessionName: session.sessionName,
    lastCompletedCheckpoint: null,
    contextOverrides: null,
    originalToolNames: null,
  });

  return convertSessionMessages(session.messages, buildCheckpointMapByTurn(session, workspaceId));
}

export function registerAgentHandlers(): void {
  installCliAgentBridge({
    getEntry: (id) => pool.get(id),
    listEntries: () => [...pool.entries()],
    sendEvent,
  });

  // ── Gateway agent bridge ─────────────────────────────────
  installGatewayAgentOps({
    openSession: async (sessionId, workspaceId) => {
      if (pool.has(sessionId)) return;
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionPath = sm.getSessionFile()!;
      appendFileSync(sessionPath, JSON.stringify(sm.getHeader()) + '\n');
      await openSessionInternal(sessionId, sessionPath, workspaceId);
    },
    prompt: async (sessionId, text) => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await entry.session.prompt(text);
    },
    steer: async (sessionId, text) => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      await entry.session.steer(text);
    },
    abort: async (sessionId) => {
      const entry = pool.get(sessionId);
      if (entry) await entry.session.abort();
    },
    listWorkspaces: async () => {
      const ws = await workspaceManager.list();
      return ws.map((w) => ({ id: w.id, name: w.name, path: w.path || '' }));
    },
    listSessions: async (workspaceId) => {
      const wsPath = workspaceManager.getPath(workspaceId);
      const all = await SessionManager.list(os.homedir(), SERO_SESSION_DIR);
      return all.filter((s) => s.cwd === wsPath).map((s) => ({ id: s.id, name: s.name || '' }));
    },
  });

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
    IpcChannels.agent.steer,
    async (
      _event,
      sessionId: string,
      text: string,
      clientMessageId?: string,
    ): Promise<void> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      // Emit the user message so the renderer can show it immediately
      const userMessageId = clientMessageId?.trim() || nextId();
      const userMsg: ChatMessage = { type: 'user', id: userMessageId, text };
      sendEvent({ type: 'message_start', sessionId, message: userMsg });

      await entry.session.steer(text);
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

  // ── Rename session ────────────────────────────────────────
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

  const { app } = require('electron');
  app.on('before-quit', () => {
    disposeAll();
  });
}
