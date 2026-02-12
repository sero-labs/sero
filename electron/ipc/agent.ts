/**
 * Agent IPC handlers.
 *
 * Manages a singleton AgentSession in the main process.
 * Streams events to the renderer via webContents.send().
 *
 * Shared infrastructure (auth, model, tools, settings) is initialised
 * once and reused across session switches — only the SessionManager
 * changes when the user picks a different chat.
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  createCodingTools,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';
import os from 'os';
import path from 'path';

import { IpcChannels } from '../../src/types/ipc';
import type {
  ChatMessage,
  ChatAssistantMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
} from '../../src/types/ipc';

// ── Constants ────────────────────────────────────────────────

const SERO_AGENT_DIR = path.join(os.homedir(), '.sero-ui', 'agent');
const SERO_SESSION_DIR = path.join(SERO_AGENT_DIR, 'sessions');
const SERO_CWD = path.join(os.homedir(), '.sero-ui');

// ── Shared infrastructure (lazy, initialised on first use) ───
//
// Must be lazy because loadSeroEnv() in main.ts needs to run first
// to populate process.env before the SDK reads API keys.

let _authStorage: AuthStorage | null = null;
let _modelRegistry: ModelRegistry | null = null;
let _settingsManager: ReturnType<typeof SettingsManager.create> | null = null;
let _tools: ReturnType<typeof createCodingTools> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any = null;
let _resourceLoader: DefaultResourceLoader | null = null;
let _resourceLoaderReady: Promise<void> | null = null;

/** Lazy-init shared infrastructure. Called once, then cached. */
async function ensureInfra() {
  if (!_authStorage) {
    _authStorage = new AuthStorage(path.join(SERO_AGENT_DIR, 'auth.json'));
    _modelRegistry = new ModelRegistry(_authStorage);
    _settingsManager = SettingsManager.create(SERO_CWD, SERO_AGENT_DIR);
    _tools = createCodingTools(SERO_CWD);
    _model = getModel('anthropic', 'claude-opus-4-6');
    if (!_model) throw new Error('Model claude-opus-4-6 not found in registry');

    _resourceLoader = new DefaultResourceLoader({
      cwd: SERO_CWD,
      agentDir: SERO_AGENT_DIR,
      settingsManager: _settingsManager,
    });
  }

  if (!_resourceLoaderReady) {
    _resourceLoaderReady = _resourceLoader!.reload();
  }
  await _resourceLoaderReady;
}

// ── Session state ────────────────────────────────────────────

let currentSession: AgentSession | null = null;
let unsubscribe: (() => void) | null = null;
let currentAssistantId: string | null = null;

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
 * Convert the existing session.messages into renderer-friendly ChatMessages.
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

/** Clean up current session. */
function closeCurrentSession(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (currentSession) {
    currentSession.dispose();
    currentSession = null;
  }
  currentAssistantId = null;
}

/** Wire up event subscription for the current session. */
function subscribeToSession(session: AgentSession): void {
  unsubscribe = session.subscribe((event) => {
    switch (event.type) {
      case 'agent_start':
        sendEvent({ type: 'agent_start' });
        break;

      case 'agent_end':
        sendEvent({ type: 'agent_end' });
        break;

      case 'message_start': {
        if (event.message.role === 'assistant') {
          const chatMsg: ChatAssistantMessage = {
            type: 'assistant',
            id: nextId(),
            text: '',
            isStreaming: true,
          };
          currentAssistantId = chatMsg.id;
          sendEvent({ type: 'message_start', message: chatMsg });
        }
        break;
      }

      case 'message_update': {
        const ame = event.assistantMessageEvent;
        if (ame.type === 'text_delta' && currentAssistantId) {
          sendEvent({
            type: 'text_delta',
            messageId: currentAssistantId,
            delta: ame.delta,
          });
        }
        break;
      }

      case 'message_end': {
        if (event.message.role === 'assistant' && currentAssistantId) {
          const textParts = event.message.content.filter(
            (c): c is { type: 'text'; text: string } => c.type === 'text',
          );
          sendEvent({
            type: 'message_end',
            messageId: currentAssistantId,
            text: textParts.map((c) => c.text).join(''),
          });
          currentAssistantId = null;
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
        sendEvent({ type: 'tool_start', tool: toolMsg });
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
          toolCallId: event.toolCallId,
          output: text,
          isError: event.isError,
        });
        break;
      }
    }
  });
}

// ── Registration ─────────────────────────────────────────────

export function registerAgentHandlers(): void {
  // ── Open a session ─────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.open,
    async (_event, sessionPath: string): Promise<ChatMessage[]> => {
      closeCurrentSession();
      await ensureInfra();

      const { session } = await createAgentSession({
        cwd: SERO_CWD,
        agentDir: SERO_AGENT_DIR,
        model: _model,
        thinkingLevel: 'off',
        authStorage: _authStorage!,
        modelRegistry: _modelRegistry!,
        tools: _tools!,
        resourceLoader: _resourceLoader!,
        sessionManager: SessionManager.open(sessionPath, SERO_SESSION_DIR),
        settingsManager: _settingsManager!,
      });

      currentSession = session;
      subscribeToSession(session);

      return convertSessionMessages(session.messages);
    },
  );

  // ── Send a prompt ──────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.agent.prompt,
    async (_event, text: string): Promise<void> => {
      if (!currentSession) throw new Error('No active session');

      const userMsg: ChatMessage = { type: 'user', id: nextId(), text };
      sendEvent({ type: 'message_start', message: userMsg });

      await currentSession.prompt(text);
    },
  );

  // ── Abort ──────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.agent.abort, async (): Promise<void> => {
    if (currentSession) {
      await currentSession.abort();
    }
  });

  // ── Close session ──────────────────────────────────────────
  ipcMain.handle(IpcChannels.agent.close, async (): Promise<void> => {
    closeCurrentSession();
  });
}
