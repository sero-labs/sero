/**
 * Agent IPC handlers — AgentPool.
 * Helpers, validation, and conversion live in agent-helpers.ts.
 */

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
  SessionModelState,
} from '../../src/types/ipc';

import {
  nextId,
  validateThinkingLevel,
  validateProvider,
  convertSessionMessages,
  attachmentsToImages,
  buildModelState,
  readHiddenCommands,
  buildCommandList,
} from './agent-helpers';
import { workspaceManager } from '../workspace';
import { createSeroExtensionFactory } from '../sero-extension';
import { SERO_AGENT_DIR } from '../env';
import { getModel as getModelFromRegistry } from '@mariozechner/pi-ai';
import {
  ensureInfra,
  containerManager,
  SERO_SESSION_DIR,
  SERO_CONFIG_PATH,
} from './shared-infra';
import { createContainerTools } from '../container/tools';
import type { ContainerState } from '../container/index';

// ── Agent Pool ───────────────────────────────────────────────

interface PoolEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
  unsubscribe: () => void;
  workspaceId: string;
  currentAssistantId: string | null;
  /** Last known session name — used to detect changes and push to renderer. */
  lastSessionName: string | undefined;
}

/** Map<sessionId, PoolEntry> — one AgentSession per active chat. */
const pool = new Map<string, PoolEntry>();

// ── Helpers ──────────────────────────────────────────────────

/** Send an event to all renderer windows. */
function sendEvent(event: AgentStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.agent.event, event);
  }
}

/** Close and dispose a single pool entry. */
function closePoolEntry(sessionId: string): void {
  const entry = pool.get(sessionId);
  if (!entry) return;
  entry.unsubscribe();
  entry.session.dispose();
  pool.delete(sessionId);
}

/** Close all pool entries (app shutdown). */
function disposeAll(): void {
  for (const sessionId of pool.keys()) {
    closePoolEntry(sessionId);
  }
}

/** Wire up event subscription for a session, tagging all events with sessionId. */
function subscribeToSession(sessionId: string, session: AgentSession): () => void {
  return session.subscribe((event) => {
    const entry = pool.get(sessionId);
    if (!entry) return;

    switch (event.type) {
      case 'agent_start':
        sendEvent({ type: 'agent_start', sessionId });
        break;

      case 'agent_end':
        sendEvent({ type: 'agent_end', sessionId });
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
        // Hide internal tools from the UI
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
        // Internal tools: hide from UI but push side-effects immediately
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

// ── Global AGENTS.md ─────────────────────────────────────────

/**
 * Read AGENTS.md from the global workspace (if it exists).
 * Returns a context file entry for injection, or null.
 */
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

// ── Registration ─────────────────────────────────────────────

export function registerAgentHandlers(): void {
  // ── Open a session (creates AgentSession in pool) ──────────
  ipcMain.handle(
    IpcChannels.agent.open,
    async (_event, sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]> => {
      // If already open, just return existing messages
      const existing = pool.get(sessionId);
      if (existing) {
        return convertSessionMessages(existing.session.messages);
      }

      const infra = await ensureInfra();

      // Resolve workspace path
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      // Check if this workspace has containers enabled (defaults to true).
      const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);

      // Ensure the workspace's container is running (lazy creation).
      // Notify renderer of container state transitions.
      let containerState: ContainerState | null = null;
      if (!containerEnabled) {
        console.log(`[agent] Container disabled for workspace ${workspaceId}, using host tools`);
      }
      try {
        if (containerEnabled) {
          sendEvent({ type: 'container_starting', sessionId, workspaceId });
          containerState = await containerManager.ensure({
            workspaceId,
            hostPath: wsPath,
          });
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
        // Fall through — session will use host tools as fallback
      }

      // Build tools: container tools replace built-in host tools.
      // customTools = our container-proxied tools (ToolDefinition[])
      // tools = [] disables the SDK's built-in host-side coding tools
      // If container failed, fall back to normal host coding tools.
      const useContainer = !!containerState;
      const containerTools = useContainer
        ? createContainerTools(containerManager, workspaceId)
        : undefined;
      const builtinTools = useContainer ? [] : createCodingTools(wsPath);

      // Read global workspace AGENTS.md (inherited by all workspaces)
      const globalAgentsFile = await readGlobalAgentsMd();

      // Workspace-scoped resource loader with Sero extension.
      // Uses SERO_AGENT_DIR so we discover skills, prompts, extensions,
      // and packages from Sero's own agent directory (~/.sero-ui/agent/).
      // Sero app extensions (e.g. todo) are loaded automatically via
      // settings.json packages list — no manual loading needed.
      //
      // Resource loader reads from HOST filesystem (wsPath) for skill/prompt
      // discovery. The bind mount makes the same files visible inside the
      // container at /workspace.
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
        // Inject global workspace AGENTS.md as base context.
        // DefaultResourceLoader discovers workspace-level AGENTS.md via cwd walk-up;
        // this adds the global workspace's on top so all sessions inherit it.
        ...(globalAgentsFile && {
          agentsFilesOverride: (discovered) => ({
            agentsFiles: [globalAgentsFile, ...discovered.agentsFiles],
          }),
        }),
      });
      await loader.reload();

      // Don't pass model/thinkingLevel — the SDK restores them from the
      // session file (model_change / thinking_level_change entries). For new
      // sessions it falls back to settings.json defaults, then first available.
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

      // Subscribe and store
      const unsubscribe = subscribeToSession(sessionId, session);
      pool.set(sessionId, {
        session,
        loader,
        unsubscribe,
        workspaceId,
        currentAssistantId: null,
        lastSessionName: session.sessionName,
      });

      return convertSessionMessages(session.messages);
    },
  );

  // ── Send a prompt to a specific session ────────────────────
  ipcMain.handle(
    IpcChannels.agent.prompt,
    async (_event, sessionId: string, text: string, attachments?: ChatAttachment[]): Promise<void> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      const userMsg: ChatMessage = { type: 'user', id: nextId(), text, attachments };
      sendEvent({ type: 'message_start', sessionId, message: userMsg });

      const images = attachmentsToImages(attachments);
      await entry.session.prompt(text, images ? { images } : undefined);
    },
  );

  // ── Abort a specific session ───────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.abort,
    async (_event, sessionId: string): Promise<void> => {
      const entry = pool.get(sessionId);
      if (entry) {
        await entry.session.abort();
      }
    },
  );

  // ── Close a specific session ───────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.close,
    async (_event, sessionId: string): Promise<void> => {
      closePoolEntry(sessionId);
    },
  );

  // ── Get available slash commands for a session ──────────────
  ipcMain.handle(
    IpcChannels.agent.getCommands,
    async (_event, sessionId: string): Promise<SeroSlashCommandInfo[]> => {
      const entry = pool.get(sessionId);
      if (!entry) return [];
      const hidden = await readHiddenCommands(SERO_CONFIG_PATH);
      return buildCommandList(entry, hidden);
    },
  );

  // ── Reload resources for a session (hot-reload) ────────────
  ipcMain.handle(
    IpcChannels.agent.reloadResources,
    async (_event, sessionId: string): Promise<SeroSlashCommandInfo[]> => {
      const entry = pool.get(sessionId);
      if (!entry) return [];

      // Re-discover skills, prompts, extensions from disk
      await entry.loader.reload();

      const hidden = await readHiddenCommands(SERO_CONFIG_PATH);
      return buildCommandList(entry, hidden);
    },
  );

  // ── Get usage stats for a session ───────────────────────────
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

  // ── Get model + thinking state for a session ────────────────
  ipcMain.handle(
    IpcChannels.agent.getModelState,
    async (_event, sessionId: string): Promise<SessionModelState | null> => {
      const entry = pool.get(sessionId);
      if (!entry) return null;
      return buildModelState(entry);
    },
  );

  // ── Set model for a session ────────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.setModel,
    async (_event, sessionId: string, provider: string, modelId: string): Promise<SessionModelState> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      // Validate provider is known
      const validatedProvider = validateProvider(provider);

      // Look up the model from registry
      const model = getModelFromRegistry(validatedProvider, modelId as any);
      if (!model) {
        // Provide helpful error with available models
        const available = entry.session.modelRegistry.getAvailable();
        const availableIds = available.map(m => `${m.provider}/${m.id}`).join(', ');
        throw new Error(
          `Model not found: ${provider}/${modelId}. ` +
          `Available models: ${availableIds || '(none)'}`
        );
      }

      // Verify the user has valid auth credentials for this model
      const availableModels = entry.session.modelRegistry.getAvailable();
      const hasAuth = availableModels.some(m => m.provider === provider && m.id === modelId);
      if (!hasAuth) {
        throw new Error(
          `No auth credentials for ${provider}/${modelId}. ` +
          `Run 'pi auth' to add credentials, then refresh.`
        );
      }

      await entry.session.setModel(model);
      const state = buildModelState(entry);
      sendEvent({ type: 'model_change', sessionId, state });
      return state;
    },
  );

  // ── Set thinking level for a session ───────────────────────
  ipcMain.handle(
    IpcChannels.agent.setThinkingLevel,
    async (_event, sessionId: string, level: string): Promise<SessionModelState> => {
      const entry = pool.get(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);

      // Validate thinking level
      const validatedLevel = validateThinkingLevel(level);
      entry.session.setThinkingLevel(validatedLevel);
      const state = buildModelState(entry);
      sendEvent({ type: 'model_change', sessionId, state });
      return state;
    },
  );

  // ── Cleanup on app quit ────────────────────────────────────
  const { app } = require('electron');
  app.on('before-quit', () => {
    disposeAll();
  });
}
