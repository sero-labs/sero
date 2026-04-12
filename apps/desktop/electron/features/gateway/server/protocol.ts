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
  /** Base64-encoded images to include with the prompt. */
  images?: Array<{ data: string; mimeType: string }>;
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

export interface GatewayCreateSessionRequest {
  type: 'create_session';
  workspaceId: string;
  name?: string;
}

export interface GatewayListFilesRequest {
  type: 'list_files';
  workspaceId: string;
  path: string;
}

export interface GatewayReadFileRequest {
  type: 'read_file';
  workspaceId: string;
  path: string;
}

export interface GatewayListArtifactsRequest {
  type: 'list_artifacts';
  sessionId: string;
}

export interface GatewayGetArtifactRequest {
  type: 'get_artifact';
  artifactId: string;
}

export interface GatewayCreateWebTokenRequest {
  type: 'create_web_token';
  label?: string;
  expiryDays?: number;
  workspaceIds?: string[];
}

export interface GatewayListWebTokensRequest {
  type: 'list_web_tokens';
}

export interface GatewayRevokeWebTokenRequest {
  type: 'revoke_web_token';
  tokenId: string;
}

export interface GatewayGetSessionHistoryRequest {
  type: 'get_session_history';
  workspaceId: string;
  sessionId: string;
}

export type GatewayRequest =
  | GatewayConnectRequest
  | GatewayPromptRequest
  | GatewaySteerRequest
  | GatewayAbortRequest
  | GatewayStatusRequest
  | GatewayListWorkspacesRequest
  | GatewayListSessionsRequest
  | GatewayCreateSessionRequest
  | GatewayListFilesRequest
  | GatewayReadFileRequest
  | GatewayListArtifactsRequest
  | GatewayGetArtifactRequest
  | GatewayCreateWebTokenRequest
  | GatewayListWebTokensRequest
  | GatewayRevokeWebTokenRequest
  | GatewayGetSessionHistoryRequest;

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
  /** Tool input parameters for display (optional). */
  input?: Record<string, unknown>;
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
  'create_session',
  'list_files',
  'read_file',
  'list_artifacts',
  'get_artifact',
  'create_web_token',
  'list_web_tokens',
  'revoke_web_token',
  'get_session_history',
]);

export function validateRequest(data: unknown): GatewayRequest | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== 'string' || !VALID_REQUEST_TYPES.has(obj.type)) return null;
  return obj as unknown as GatewayRequest;
}
