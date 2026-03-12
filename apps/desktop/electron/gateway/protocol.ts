/**
 * Gateway WebSocket protocol — message types and validation.
 *
 * Inspired by OpenClaw's gateway protocol: JSON frames over WebSocket,
 * with typed request/response/push messages.
 */

// ── Client → Gateway requests ───────────────────────────────

export interface GatewayConnectRequest {
  type: 'connect';
  token: string;
  clientType: 'web' | 'discord' | 'cli';
  clientId?: string;
}

export interface GatewayPromptRequest {
  type: 'prompt';
  workspaceId: string;
  sessionId: string;
  text: string;
  /** Idempotency key to safely retry. */
  idempotencyKey?: string;
}

export interface GatewaySteerRequest {
  type: 'steer';
  sessionId: string;
  text: string;
}

export interface GatewayAbortRequest {
  type: 'abort';
  sessionId: string;
}

export interface GatewayStatusRequest {
  type: 'status';
  sessionId?: string;
}

export interface GatewayListWorkspacesRequest {
  type: 'list_workspaces';
}

export interface GatewayListSessionsRequest {
  type: 'list_sessions';
  workspaceId: string;
}

export type GatewayRequest =
  | GatewayConnectRequest
  | GatewayPromptRequest
  | GatewaySteerRequest
  | GatewayAbortRequest
  | GatewayStatusRequest
  | GatewayListWorkspacesRequest
  | GatewayListSessionsRequest;

// ── Gateway → Client responses ──────────────────────────────

export interface GatewayOkResponse {
  type: 'ok';
  requestType: string;
  data?: unknown;
}

export interface GatewayErrorResponse {
  type: 'error';
  requestType: string;
  message: string;
}

export type GatewayResponse = GatewayOkResponse | GatewayErrorResponse;

// ── Gateway → Client push events (streaming) ────────────────

export interface GatewayAgentStartEvent {
  type: 'agent_start';
  sessionId: string;
}

export interface GatewayAgentEndEvent {
  type: 'agent_end';
  sessionId: string;
}

export interface GatewayTextDeltaEvent {
  type: 'text_delta';
  sessionId: string;
  delta: string;
}

export interface GatewayThinkingDeltaEvent {
  type: 'thinking_delta';
  sessionId: string;
  delta: string;
}

export interface GatewayToolStartEvent {
  type: 'tool_start';
  sessionId: string;
  toolName: string;
  toolCallId: string;
}

export interface GatewayToolEndEvent {
  type: 'tool_end';
  sessionId: string;
  toolCallId: string;
  output: string | null;
  isError: boolean;
  /** Images returned by this tool call (e.g. screenshots). */
  images?: Array<{ data: string; mimeType: string; description?: string }>;
}

export interface GatewayArtifactEvent {
  type: 'artifact_added';
  sessionId: string;
  artifactId: string;
  artifactType: string;
  title: string;
}

export type GatewayPushEvent =
  | GatewayAgentStartEvent
  | GatewayAgentEndEvent
  | GatewayTextDeltaEvent
  | GatewayThinkingDeltaEvent
  | GatewayToolStartEvent
  | GatewayToolEndEvent
  | GatewayArtifactEvent;

// ── Validation ──────────────────────────────────────────────

const VALID_REQUEST_TYPES = new Set([
  'connect',
  'prompt',
  'steer',
  'abort',
  'status',
  'list_workspaces',
  'list_sessions',
]);

export function validateRequest(data: unknown): GatewayRequest | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== 'string' || !VALID_REQUEST_TYPES.has(obj.type)) return null;
  return obj as unknown as GatewayRequest;
}
