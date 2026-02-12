/**
 * Shared IPC type definitions.
 *
 * Imported by both Electron main process and renderer.
 * Each domain gets a channel prefix and typed payloads.
 */

// ── Sessions ───────────────────────────────────────────────────

/** Session info surfaced to the renderer. Mirrors Pi SDK's SessionInfo. */
export interface SeroSessionInfo {
  path: string;
  id: string;
  /** Working directory where the session was started. */
  cwd: string;
  /** User-defined display name (from /name command). */
  name?: string;
  created: string; // ISO string (Date doesn't survive IPC)
  modified: string; // ISO string
  messageCount: number;
  firstMessage: string;
}

// ── Agent ──────────────────────────────────────────────────────

/** Renderer-friendly message types for the ChatPanel. */
export type ChatMessage =
  | ChatUserMessage
  | ChatAssistantMessage
  | ChatToolCallMessage;

export interface ChatUserMessage {
  type: 'user';
  id: string;
  text: string;
}

export interface ChatAssistantMessage {
  type: 'assistant';
  id: string;
  text: string;
  /** True while this message is still receiving deltas. */
  isStreaming: boolean;
}

export interface ChatToolCallMessage {
  type: 'tool';
  id: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string | null;
  isError: boolean;
  state: 'pending' | 'running' | 'completed' | 'error';
}

/**
 * Events pushed from main → renderer during agent streaming.
 * Kept deliberately slim — only what the UI needs to render.
 */
export type AgentStreamEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'messages_loaded'; messages: ChatMessage[] }
  | { type: 'text_delta'; messageId: string; delta: string }
  | { type: 'message_start'; message: ChatMessage }
  | { type: 'message_end'; messageId: string; text: string }
  | { type: 'tool_start'; tool: ChatToolCallMessage }
  | { type: 'tool_end'; toolCallId: string; output: string | null; isError: boolean }
  | { type: 'error'; error: string };

// ── IPC Channels ───────────────────────────────────────────────

/** IPC channel constants — single source of truth. */
export const IpcChannels = {
  sessions: {
    list: 'sero:sessions:list',
    create: 'sero:sessions:create',
    delete: 'sero:sessions:delete',
  },
  agent: {
    open: 'sero:agent:open',
    prompt: 'sero:agent:prompt',
    abort: 'sero:agent:abort',
    close: 'sero:agent:close',
    /** Main → renderer push channel for streaming events. */
    event: 'sero:agent:event',
  },
} as const;
