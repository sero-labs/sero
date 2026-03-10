/**
 * Codex JSON-RPC protocol types and helpers.
 *
 * Handles message parsing, construction, and event type classification
 * for the Codex app-server JSON-RPC protocol over stdio.
 */

// ── JSON-RPC message types ─────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ── Codex event types ──────────────────────────────────────────

export type CodexEventType =
  | 'session_started'
  | 'turn/start'
  | 'turn/completed'
  | 'turn/failed'
  | 'turn/cancelled'
  | 'agent/tool_call'
  | 'agent/message'
  | 'agent/approval_request'
  | 'agent/user_input_required'
  | 'agent/unsupported_tool';

export interface CodexEvent {
  type: CodexEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ── Message construction ───────────────────────────────────────

let nextId = 1;

export function createRequest(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: nextId++,
    method,
    params,
  };
}

export function createInitialize(): JsonRpcRequest {
  return createRequest('initialize', {
    protocolVersion: '2024-01',
    capabilities: {},
    clientInfo: { name: 'symphony', version: '0.1.0' },
  });
}

export function createInitialized(): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method: 'initialized',
  };
}

export function createThreadStart(prompt: string): JsonRpcRequest {
  return createRequest('thread/start', {
    prompt,
  });
}

export function createTurnStart(threadId: string, prompt: string): JsonRpcRequest {
  return createRequest('turn/start', {
    threadId,
    prompt,
  });
}

export function createApprovalResponse(requestId: string, approved: boolean): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method: 'agent/approval_response',
    params: { requestId, approved },
  };
}

// ── Message parsing ────────────────────────────────────────────

export function parseJsonRpcLine(line: string): JsonRpcMessage | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed.jsonrpc !== '2.0') return null;
    return parsed as JsonRpcMessage;
  } catch {
    return null;
  }
}

// ── Token extraction ───────────────────────────────────────────

export function extractTokenUsage(data: Record<string, unknown>): TokenUsage | null {
  // Try multiple known shapes
  const usage = data.usage ?? data.tokenUsage ?? data.token_usage;
  if (!usage || typeof usage !== 'object') return null;

  const u = usage as Record<string, unknown>;
  const input = Number(u.inputTokens ?? u.input_tokens ?? u.prompt_tokens ?? 0);
  const output = Number(u.outputTokens ?? u.output_tokens ?? u.completion_tokens ?? 0);

  if (input === 0 && output === 0) return null;

  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  };
}

// ── Event classification ───────────────────────────────────────

export function isTurnTerminal(eventType: string): boolean {
  return (
    eventType === 'turn/completed' ||
    eventType === 'turn/failed' ||
    eventType === 'turn/cancelled'
  );
}

export function isApprovalRequest(eventType: string): boolean {
  return eventType === 'agent/approval_request';
}

export function isUserInputRequired(eventType: string): boolean {
  return eventType === 'agent/user_input_required';
}
