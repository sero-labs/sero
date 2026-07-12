/**
 * Agent, chat, and model type definitions.
 *
 * Extracted from ipc.ts to keep individual files under 500 LOC.
 * Re-exported from ipc.ts so existing imports continue to work.
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { ChatComposerPrefill, ChatTurnUndoRef } from './turn-undo';

// ── Chat Messages ──────────────────────────────────────────────

/** Renderer-friendly message types for the ChatPanel. */
export type ChatMessage =
  | ChatUserMessage
  | ChatAssistantMessage
  | ChatToolCallMessage;

/** File attachment metadata for user messages. */
export interface ChatAttachment {
  id: string;
  filename?: string;
  mediaType?: string;
  /** Data URL (base64) or blob URL. */
  url: string;
}

/** An image returned by a tool (e.g. screenshot, browser capture). */
export interface ToolResultImage {
  /** Raw base64-encoded image data (no data-URI prefix). */
  data: string;
  /** MIME type, e.g. "image/png" or "image/jpeg". */
  mimeType: string;
  /** Optional description (e.g. "Screenshot of todo app"). */
  description?: string;
  /** Optional source/saved file path for surfacing image locations in the UI. */
  filePath?: string;
}

export interface ChatUserMessage {
  type: 'user';
  id: string;
  text: string;
  /** Optional file attachments included with the message. */
  attachments?: ChatAttachment[];
  /** Chat-turn undo target attached to this user message. */
  turnUndo?: ChatTurnUndoRef;
}

export interface ChatAssistantMessage {
  type: 'assistant';
  id: string;
  text: string;
  /** True while this message is still receiving deltas. */
  isStreaming: boolean;
  /** Accumulated thinking/reasoning text (only present when model uses reasoning). */
  thinking?: string;
  /** Memory context injected for this turn (from the memory extension). */
  memoryContext?: string;
}

export interface ChatToolCallMessage {
  type: 'tool';
  id: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string | null;
  isError: boolean;
  state: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  /** Structured tool metadata from the SDK result/details payload. */
  details?: Record<string, unknown> | null;
  /** True when output is an in-progress partial update rather than the final tool result. */
  isPartialOutput?: boolean;
  /** Images returned by this tool call (e.g. screenshots). */
  images?: ToolResultImage[];
}

/**
 * Events pushed from main → renderer during agent streaming.
 * Kept deliberately slim — only what the UI needs to render.
 *
 * Every event carries `sessionId` so the renderer can route events
 * to the correct AgentInstance in a multi-session pool.
 */
export type AgentStreamEvent =
  | { type: 'agent_start'; sessionId: string }
  | { type: 'agent_end'; sessionId: string }
  | { type: 'messages_loaded'; sessionId: string; messages: ChatMessage[] }
  | { type: 'text_delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'thinking_delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'message_start'; sessionId: string; message: ChatMessage }
  | { type: 'message_end'; sessionId: string; messageId: string; text: string; thinking?: string }
  | { type: 'tool_start'; sessionId: string; tool: ChatToolCallMessage }
  | { type: 'tool_update'; sessionId: string; toolCallId: string; output: string | null; details?: Record<string, unknown> | null; images?: ToolResultImage[] }
  | { type: 'tool_end'; sessionId: string; toolCallId: string; output: string | null; details?: Record<string, unknown> | null; isError: boolean; images?: ToolResultImage[] }
  | { type: 'user_turn_undo'; sessionId: string; userMessageId: string; turnUndo: ChatTurnUndoRef }
  | { type: 'composer_prefill'; sessionId: string; prefill: ChatComposerPrefill }
  | { type: 'session_name'; sessionId: string; name: string }
  | { type: 'model_change'; sessionId: string; state: SessionModelState }
  | { type: 'memory_context'; sessionId: string; context: string }
  | { type: 'error'; sessionId: string; error: string }
  | { type: 'container_starting'; sessionId: string; workspaceId: string }
  | { type: 'container_ready'; sessionId: string; workspaceId: string; ipAddress?: string }
  | { type: 'container_error'; sessionId: string; workspaceId: string; error: string }
  | { type: 'runtime_notice'; sessionId: string; workspaceId: string; runtime: 'host' | 'container'; message: string };

// ── Model Info ─────────────────────────────────────────────────

/** Serialisable model info for the renderer (no class instances). */
export interface ModelInfo {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels?: ThinkingLevel[];
  supportsXhigh?: boolean;
  supportsMax?: boolean;
}

/** Current model + thinking level for a session. */
export interface SessionModelState {
  model: ModelInfo;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  supportsXhigh: boolean;
  supportsMax: boolean;
  /** All models with auth, grouped by provider display name. */
  availableModels: AvailableModelGroup[];
}

/** A group of models under a single provider, for the model selector. */
export interface AvailableModelGroup {
  provider: string;
  displayName: string;
  /** Logo URL (models.dev SVG). */
  logo: string;
  models: ModelInfo[];
}

// ── Usage Stats ────────────────────────────────────────────────

/** Session usage stats returned by PI SDK's AgentSession.getSessionStats(). */
export interface SessionUsageStats {
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  requestCount: number;
}

/** Context window usage info for the active session. Mirrors the Pi SDK's ContextUsage type. */
export interface ContextUsageInfo {
  /** Estimated context tokens, or null if unknown (e.g. right after compaction, before next LLM response). */
  tokens: number | null;
  /** Model's maximum context window size in tokens. */
  contextWindow: number;
  /** Usage percentage (0–100), or null if tokens is unknown. */
  percent: number | null;
}

/** Result from manual compaction. */
export interface CompactResult {
  success: boolean;
  /** Approximate context tokens before compaction (only present on success). */
  tokensBefore?: number;
  error?: string;
}
