/**
 * Agent IPC handlers — AgentPool.
 *
 * Manages multiple simultaneous AgentSessions, one per active chat session.
 * Shared infrastructure (auth, model, tools factory, settings) is initialised
 * once and reused. Per-session resources (ResourceLoader, tools, SessionManager)
 * are scoped to the session's workspace cwd.
 *
 * All stream events are tagged with sessionId so the renderer can route
 * them to the correct AgentInstance in the Zustand store.
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
import { promises as fs } from 'fs';
import os from 'os';
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
} from '../../src/types/ipc';
import type { ImageContent } from '@mariozechner/pi-ai';
import { workspaceManager } from '../workspace';
import { createSeroExtensionFactory } from '../sero-extension';
import {
  ensureInfra,
  PI_AGENT_DIR,
  SERO_SESSION_DIR,
  SERO_CONFIG_PATH,
} from './shared-infra';

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

/** Generate a simple ID for renderer-side messages. */
let msgCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

/**
 * Convert existing session.messages into renderer-friendly ChatMessages.
 */
function convertSessionMessages(
  messages: ReturnType<AgentSession['agent']['state']['messages']['slice']>,
): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
      result.push({ type: 'user', id: nextId(), text });
    } else if (msg.role === 'assistant') {
      const textParts = msg.content.filter(
        (c): c is { type: 'text'; text: string } => c.type === 'text',
      );
      const text = textParts.map((c) => c.text).join('');

      if (text) {
        result.push({ type: 'assistant', id: nextId(), text, isStreaming: false });
      }

      const toolCalls = msg.content.filter(
        (c): c is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
          c.type === 'toolCall',
      );
      for (const tc of toolCalls) {
        // Hide internal tools from history
        if (tc.name === 'set_session_title') continue;

        const toolResult = messages.find(
          (m) => m.role === 'toolResult' && 'toolCallId' in m && m.toolCallId === tc.id,
        );
        let output: string | null = null;
        let isError = false;
        if (toolResult && toolResult.role === 'toolResult') {
          output = toolResult.content
            .filter((c: { type: string }): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c: { type: 'text'; text: string }) => c.text)
            .join('\n') || null;
          isError = toolResult.isError;
        }

        result.push({
          type: 'tool',
          id: nextId(),
          toolCallId: tc.id,
          toolName: tc.name,
          input: tc.arguments,
          output,
          isError,
          state: output !== null ? (isError ? 'error' : 'completed') : 'completed',
        });
      }
    }
  }

  return result;
}

/**
 * Read hiddenCommands from ~/.sero-ui/agent/settings.json.
 * Re-read on each call so edits take effect without restart.
 */
async function readHiddenCommands(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(SERO_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    if (Array.isArray(config.hiddenCommands)) {
      return new Set(config.hiddenCommands as string[]);
    }
  } catch {
    // File missing or malformed — no hidden commands
  }
  return new Set();
}

/** Build the slash command list from a pool entry's resources. PI CLI ordering. */
function buildCommandList(entry: PoolEntry, hidden?: Set<string>): SeroSlashCommandInfo[] {
  const runtime = entry.session.extensionRunner;
  if (!runtime) return [];

  // 1. Extension commands from the runner
  const extensionCommands = runtime.getRegisteredCommands();
  const extCmds: SeroSlashCommandInfo[] = extensionCommands.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    source: 'extension' as const,
  }));

  // 2. Prompt templates from the resource loader
  const { prompts } = entry.loader.getPrompts();
  const promptCmds: SeroSlashCommandInfo[] = prompts.map((p) => ({
    name: p.name,
    description: p.description,
    source: 'prompt' as const,
    path: p.source,
  }));

  // 3. Skill commands from the resource loader
  const { skills } = entry.loader.getSkills();
  const skillCmds: SeroSlashCommandInfo[] = skills.map((s) => ({
    name: `skill:${s.name}`,
    description: s.description,
    source: 'skill' as const,
    path: s.filePath,
  }));

  const all = [...extCmds, ...promptCmds, ...skillCmds];
  if (!hidden || hidden.size === 0) return all;
  return all.filter((cmd) => !hidden.has(cmd.name));
}

/**
 * Convert ChatAttachments (data-URLs) to Pi SDK ImageContent[].
 * Only image/* types are included; non-image attachments are skipped.
 */
function attachmentsToImages(attachments?: ChatAttachment[]): ImageContent[] | undefined {
  if (!attachments?.length) return undefined;

  const images: ImageContent[] = [];
  for (const att of attachments) {
    const mime = att.mediaType ?? '';
    if (!mime.startsWith('image/')) continue;

    // Parse data URL: "data:<mediaType>;base64,<data>"
    const match = att.url.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) continue;

    images.push({ type: 'image', data: match[1], mimeType: mime });
  }

  return images.length > 0 ? images : undefined;
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

      // Read global workspace AGENTS.md (inherited by all workspaces)
      const globalAgentsFile = await readGlobalAgentsMd();

      // Workspace-scoped resource loader with Sero extension.
      // Uses PI_AGENT_DIR so we discover the same skills, prompts, extensions,
      // and packages as the PI CLI — anything the user has installed globally.
      // Sero app extensions (e.g. todo) are loaded automatically via Pi's
      // settings.json packages list — no manual loading needed.
      const loader = new DefaultResourceLoader({
        cwd: wsPath,
        agentDir: PI_AGENT_DIR,
        settingsManager: infra.settingsManager,
        extensionFactories: [
          createSeroExtensionFactory(workspaceManager, workspaceId),
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

      const { session } = await createAgentSession({
        cwd: wsPath,
        agentDir: PI_AGENT_DIR,
        model: infra.model,
        thinkingLevel: 'off',
        authStorage: infra.authStorage,
        modelRegistry: infra.modelRegistry,
        tools: createCodingTools(wsPath),
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
      const hidden = await readHiddenCommands();
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

      const hidden = await readHiddenCommands();
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

  // ── Cleanup on app quit ────────────────────────────────────
  const { app } = require('electron');
  app.on('before-quit', () => {
    disposeAll();
  });
}
