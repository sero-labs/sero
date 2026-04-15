import { ipcMain, BrowserWindow } from 'electron';
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  type AgentSession,
  type SlashCommandInfo,
} from '@mariozechner/pi-coding-agent';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  ChatMessage,
  ChatAttachment,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SessionUsageStats,
  ContextUsageInfo,
  CompactResult,
  ContextOverrides,
  ContextToolInfo,
  SeroSessionInfo,
} from '@/types/ipc';
import type { ChatCheckpointRef } from '@/types/checkpoints';
import {
  nextId,
  convertSessionMessages,
  buildCheckpointMapByTurn,
  readHiddenCommands,
  buildCommandList,
  getBaseSystemPrompt,
} from './agent-helpers';
import { handlePromptInput } from './agent-prompt';
import { emitSessionShutdown, emitSessionBeforeSwitch } from './agent-session-events';
import { subscribeToSession } from './agent-subscription';
import { readGlobalAgentsMd } from './global-agents';
import { registerAgentCheckpointHandlers } from './agent-checkpoint';
import { workspaceManager } from '@electron/features/workspace/manager';
import { createHostCodingTools } from '@electron/features/container/tools';
import { createSeroExtensionFactory } from '@electron/features/apps/extensions/create-sero-extension';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  ensureInfra,
  containerManager,
  buildContainerConfig,
  subagentManager,
  SERO_SESSION_DIR,
  SERO_CONFIG_PATH,
} from '@electron/shared/infra/shared-infra';
import { createContainerTools } from '@electron/features/container/tools';
import type { ContainerState } from '@electron/features/container';
import { registerAgentModelContextHandlers } from './agent-model-context';
import { applyContextOverrides, readPersistedContextOverrides } from './agent-context-overrides';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';
import { installCliAgentBridge, noteCliTurnEnd } from '@electron/cli/bridges';
import {
  createWorkspaceCliTool,
  bridgeExtensionTools,
  clearBridgedExtensionSessionItemsForSession,
} from '@electron/cli';
import { installGatewayAgentOps, forwardEventToGateway } from '@electron/features/gateway/bridge/agent-bridge';
import { createSkillVisibilityOverride } from '@electron/features/apps/extensions/skill-visibility';
import { buildGatewayOps } from '@electron/ipc/gateway/gateway-ops';
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
  baseSystemPrompt: string;
  baseTools: ContextToolInfo[];
}
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
/** Reload all active session ResourceLoaders after edits. */
export async function reloadAllSessionResources(): Promise<void> {
  await Promise.all([...pool.values()].map((entry) => entry.loader.reload()));
}
export function emitAgentEvent(event: AgentStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.agent.event, event);
  }
  forwardEventToGateway(event as unknown as Record<string, unknown>);
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
  clearBridgedExtensionSessionItemsForSession(sessionId);
}

export async function disposeAllAgentSessions(): Promise<void> {
  await Promise.allSettled([...pool.keys()].map((sessionId) => closePoolEntry(sessionId)));
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
  } catch (containerErr: unknown) {
    const message = toErrorMessage(containerErr, 'Container failed to start');
    console.error(`[agent] Container failed for ${workspaceId}:`, message);
    sendEvent({ type: 'container_error', sessionId, workspaceId, error: message });
  }

  const useContainer = !!containerState;
  const platformTools = useContainer
    ? createContainerTools(containerManager, workspaceId, sessionId)
    : [...createHostCodingTools(wsPath), createWorkspaceCliTool(workspaceId, sessionId)];
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
    skillsOverride: createSkillVisibilityOverride(infra.settingsManager),
    extensionsOverride: (base) => bridgeExtensionTools(base, { sessionId }),
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
    tools: [],
    customTools: platformTools,
    resourceLoader: loader,
    sessionManager: SessionManager.open(sessionPath, SERO_SESSION_DIR),
    settingsManager: infra.settingsManager,
  });

  // Provide a real UIContext so extensions get working ctx.ui.notify()
  session.extensionRunner?.setUIContext(createSeroUIContext());

  const baseTools: ContextToolInfo[] = session.agent.state.tools.map((tool) => ({
    name: tool.name,
    label: (tool as { label?: string }).label,
    description: tool.description,
  }));
  const baseSystemPrompt = getBaseSystemPrompt(session) ?? session.agent.state.systemPrompt ?? '';
  const persistedOverrides = readPersistedContextOverrides(
    session,
    baseTools.map((tool) => tool.name),
  );

  const entry: PoolEntry = {
    session,
    loader,
    unsubscribe: subscribeToSession(
      sessionId,
      session,
      () => pool.get(sessionId),
      sendEvent,
    ),
    workspaceId,
    currentAssistantId: null,
    lastSessionName: session.sessionName,
    lastCompletedCheckpoint: null,
    contextOverrides: null,
    baseSystemPrompt,
    baseTools,
  };

  if (persistedOverrides) {
    applyContextOverrides(entry, persistedOverrides);
  }

  pool.set(sessionId, entry);

  return convertSessionMessages(session.messages, buildCheckpointMapByTurn(session, workspaceId));
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
          buildCheckpointMapByTurn(entry.session, entry.workspaceId),
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
      entry.lastCompletedCheckpoint = null;

      const chatMessages = convertSessionMessages(
        entry.session.messages,
        buildCheckpointMapByTurn(entry.session, entry.workspaceId),
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
