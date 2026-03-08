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
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionUsageStats,
  ContextUsageInfo,
  ContextOverrides,
  SeroSessionInfo,
} from '../../src/types/ipc';
import type { ChatCheckpointRef } from '../../src/types/checkpoints';

import {
  nextId,
  convertSessionMessages,
  buildCheckpointMapByTurn,
  attachmentsToImages,
  readHiddenCommands,
  buildCommandList,
} from './agent-helpers';
import { subscribeToSession } from './agent-subscription';
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
import { installCliAgentBridge, noteCliTurnEnd } from '../cli/agent-bridge';
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

/**
 * Get a pool entry by session ID.
 * Used by the collaboration handler to feed synthesized results
 * back through the main agent session.
 */
export function getAgentPoolEntry(sessionId: string): PoolEntry | undefined {
  return pool.get(sessionId);
}

/**
 * Reload the ResourceLoader for every active session in the pool.
 * Called after prompt template / skill edits so changes take
 * effect without restarting Sero.
 */
export async function reloadAllSessionResources(): Promise<void> {
  await Promise.all(
    [...pool.values()].map((entry) => entry.loader.reload()),
  );
}

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

  const unsubscribe = subscribeToSession(
    sessionId, session,
    () => pool.get(sessionId),
    sendEvent,
  );
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

  // ── Context usage ─────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.getContextUsage,
    async (_event, sessionId: string): Promise<ContextUsageInfo | null> => {
      const entry = pool.get(sessionId);
      if (!entry) return null;

      const model = entry.session.model;
      if (!model) return null;

      const contextWindow = model.contextWindow;
      const state = entry.session.agent.state;

      // Estimate current context tokens from session state
      let tokens = 0;
      const est = (s: string) => Math.ceil(s.length / 4);

      // System prompt
      if (state.systemPrompt) tokens += est(state.systemPrompt);

      // Tool definitions
      if (state.tools) tokens += est(JSON.stringify(state.tools.map((t: any) => ({
        name: t.name, description: t.description, parameters: t.parameters,
      }))));

      // Messages
      for (const msg of state.messages) {
        if (typeof msg.content === 'string') {
          tokens += est(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content as any[]) {
            if (part.type === 'text') tokens += est(part.text || '');
            else if (part.type === 'thinking') tokens += est(part.thinking || '');
            else if (part.type === 'toolCall') tokens += est(JSON.stringify(part));
            else if (part.type === 'toolResult') tokens += est(JSON.stringify(part));
          }
        }
      }

      const percent = contextWindow > 0 ? (tokens / contextWindow) * 100 : 0;

      return {
        tokens,
        contextWindow,
        percent: Math.min(percent, 100),
      };
    },
  );

  // ── Manual compaction ────────────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.compact,
    async (_event, sessionId: string, customInstructions?: string): Promise<{ success: boolean; error?: string }> => {
      const entry = pool.get(sessionId);
      if (!entry) return { success: false, error: 'No active session' };

      try {
        await entry.session.compact(customInstructions);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Compaction failed' };
      }
    },
  );

  // ── Clear session (branch from root) ──────────────────────
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
        // Already empty — nothing to clear
        return convertSessionMessages(
          entry.session.messages,
          buildCheckpointMapByTurn(entry.session, entry.workspaceId),
        );
      }

      const rootId = branch[0].id;
      sm.branch(rootId);
      const ctx = sm.buildSessionContext();
      entry.session.agent.replaceMessages(ctx.messages);
      entry.lastCompletedCheckpoint = null;

      const chatMessages = convertSessionMessages(
        entry.session.messages,
        buildCheckpointMapByTurn(entry.session, entry.workspaceId),
      );
      sendEvent({ type: 'messages_loaded', sessionId, messages: chatMessages });

      return chatMessages;
    },
  );

  // ── Fork session (extract branch to new file) ─────────────
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

      // createBranchedSession extracts the current branch to a new .jsonl file
      const newSessionPath = sm.createBranchedSession(leafId);

      // Open the new file to read its header
      const newSm = SessionManager.open(newSessionPath, SERO_SESSION_DIR);
      const header = newSm.getHeader();
      const branch = newSm.getBranch();
      const now = new Date();

      return {
        path: newSessionPath,
        id: newSm.getSessionId(),
        cwd: header.cwd,
        workspaceId: entry.workspaceId,
        name: undefined,
        created: now.toISOString(),
        modified: now.toISOString(),
        messageCount: branch.filter(
          (e) => e.type === 'message' && e.message.role === 'user',
        ).length,
        firstMessage: '',
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
