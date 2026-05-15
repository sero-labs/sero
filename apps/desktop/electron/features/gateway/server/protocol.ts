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
  /** Null means unrestricted owner access; string[] means explicitly scoped access. */
  workspaceIds: string[] | null;
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

export interface GatewayListDevServersRequest {
  type: 'list_dev_servers';
  /** Filter to a specific workspace. Omit to list all servers in scope. */
  workspaceId?: string;
}

export interface GatewayCreateDevProxyTicketRequest {
  type: 'create_devserver_ticket';
  workspaceId: string;
  port: number;
}

export interface GatewayVoiceStatusRequest {
  type: 'voice_status';
}

export interface GatewayVoiceTranscribeRequest {
  type: 'voice_transcribe';
  /** Base64 data URL of the recorded audio. */
  audioDataUrl: string;
  mimeType?: string;
}

export type GatewayRequest = (
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
  | GatewayGetSessionHistoryRequest
  | GatewayListDevServersRequest
  | GatewayCreateDevProxyTicketRequest
  | GatewayVoiceStatusRequest
  | GatewayVoiceTranscribeRequest
) & {
  /** Optional correlation id echoed back on the matching response. */
  requestId?: string;
};

// ── Gateway → Client responses ──────────────────────────────

export interface GatewayOkResponse {
  type: 'ok';
  requestType: string;
  /** Echoed back so callers can correlate request/response pairs. */
  requestId?: string;
  data?: unknown;
}

export interface GatewayErrorResponse {
  type: 'error';
  requestType: string;
  /** Echoed back so callers can correlate request/response pairs. */
  requestId?: string;
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

/**
 * Dev server lifecycle event. The `server` shape mirrors `DevServer`
 * from the IPC types but is treated as opaque JSON here so the protocol
 * stays decoupled from the host registry.
 */
export interface GatewayDevServerChangedEvent {
  type: 'dev_server_changed';
  /** The workspace the affected server belongs to. Used for scope filtering. */
  workspaceId: string;
  change:
    | { type: 'registered'; server: Record<string, unknown> }
    | { type: 'unregistered'; serverId: string }
    | { type: 'status_changed'; serverId: string; status: 'running' | 'stopped' | 'starting' | 'failed' };
}

export type GatewayPushEvent =
  | GatewayAgentStartEvent
  | GatewayAgentEndEvent
  | GatewayTextDeltaEvent
  | GatewayThinkingDeltaEvent
  | GatewayToolStartEvent
  | GatewayToolEndEvent
  | GatewayArtifactEvent
  | GatewayDevServerChangedEvent;

// ── Validation ──────────────────────────────────────────────

const VALID_REQUEST_TYPES = new Set<GatewayRequest['type']>([
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
  'list_dev_servers',
  'create_devserver_ticket',
  'voice_status',
  'voice_transcribe',
]);

const VALID_CLIENT_TYPES = new Set<GatewayConnectRequest['clientType']>(['web', 'discord', 'cli']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined | null {
  const value = obj[key];
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

function readOptionalFiniteNumber(obj: Record<string, unknown>, key: string): number | undefined | null {
  const value = obj[key];
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPromptImages(value: unknown): GatewayPromptRequest['images'] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const images: NonNullable<GatewayPromptRequest['images']> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const data = readRequiredString(entry, 'data');
    const mimeType = readRequiredString(entry, 'mimeType');
    if (!data || !mimeType) return null;
    images.push({ data, mimeType });
  }
  return images;
}

function readWorkspaceIds(
  obj: Record<string, unknown>,
): { ok: true; workspaceIds: string[] | null } | { ok: false } {
  const value = obj.workspaceIds;
  if (value === null) {
    return { ok: true, workspaceIds: null };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false };
  }

  const workspaceIds: string[] = [];
  for (const workspaceId of value) {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      return { ok: false };
    }
    workspaceIds.push(workspaceId);
  }
  return { ok: true, workspaceIds };
}

export function validateRequest(data: unknown): GatewayRequest | null {
  if (!isRecord(data)) return null;
  if (typeof data.type !== 'string' || !VALID_REQUEST_TYPES.has(data.type as GatewayRequest['type'])) {
    return null;
  }

  const requestId = readOptionalString(data, 'requestId');
  if (requestId === null) return null;

  const inner = validateRequestBody(data);
  if (!inner) return null;

  return requestId === undefined
    ? (inner as GatewayRequest)
    : ({ ...inner, requestId } as GatewayRequest);
}

function validateRequestBody(data: Record<string, unknown>): GatewayRequest | null {
  switch (data.type) {
    case 'connect': {
      const token = readRequiredString(data, 'token');
      const clientType = readRequiredString(data, 'clientType');
      const clientId = readOptionalString(data, 'clientId');
      if (!token || !clientType || !VALID_CLIENT_TYPES.has(clientType as GatewayConnectRequest['clientType'])) {
        return null;
      }
      if (clientId === null) return null;
      return { type: 'connect', token, clientType: clientType as GatewayConnectRequest['clientType'], clientId };
    }

    case 'prompt': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      const text = readOptionalString(data, 'text');
      const idempotencyKey = readOptionalString(data, 'idempotencyKey');
      const images = readPromptImages(data.images);
      if (!workspaceId || !sessionId || text === null || text === undefined || idempotencyKey === null || images === null) {
        return null;
      }
      return { type: 'prompt', workspaceId, sessionId, text, images, idempotencyKey };
    }

    case 'steer': {
      const sessionId = readRequiredString(data, 'sessionId');
      const text = readOptionalString(data, 'text');
      if (!sessionId || text === null || text === undefined) return null;
      return { type: 'steer', sessionId, text };
    }

    case 'abort': {
      const sessionId = readRequiredString(data, 'sessionId');
      return sessionId ? { type: 'abort', sessionId } : null;
    }

    case 'status': {
      const sessionId = readOptionalString(data, 'sessionId');
      return sessionId === null ? null : { type: 'status', sessionId };
    }

    case 'list_workspaces':
      return { type: 'list_workspaces' };

    case 'list_sessions': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      return workspaceId ? { type: 'list_sessions', workspaceId } : null;
    }

    case 'create_session': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const name = readOptionalString(data, 'name');
      if (!workspaceId || name === null) return null;
      return { type: 'create_session', workspaceId, name };
    }

    case 'list_files': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const requestPath = readRequiredString(data, 'path');
      return workspaceId && requestPath
        ? { type: 'list_files', workspaceId, path: requestPath }
        : null;
    }

    case 'read_file': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const requestPath = readRequiredString(data, 'path');
      return workspaceId && requestPath
        ? { type: 'read_file', workspaceId, path: requestPath }
        : null;
    }

    case 'list_artifacts': {
      const sessionId = readRequiredString(data, 'sessionId');
      return sessionId ? { type: 'list_artifacts', sessionId } : null;
    }

    case 'get_artifact': {
      const artifactId = readRequiredString(data, 'artifactId');
      return artifactId ? { type: 'get_artifact', artifactId } : null;
    }

    case 'create_web_token': {
      const workspaceScope = readWorkspaceIds(data);
      const label = readOptionalString(data, 'label');
      const expiryDays = readOptionalFiniteNumber(data, 'expiryDays');
      if (!workspaceScope.ok || label === null || expiryDays === null) return null;
      if (expiryDays !== undefined && (!Number.isInteger(expiryDays) || expiryDays <= 0)) {
        return null;
      }
      return { type: 'create_web_token', workspaceIds: workspaceScope.workspaceIds, label, expiryDays };
    }

    case 'list_web_tokens':
      return { type: 'list_web_tokens' };

    case 'revoke_web_token': {
      const tokenId = readRequiredString(data, 'tokenId');
      return tokenId ? { type: 'revoke_web_token', tokenId } : null;
    }

    case 'get_session_history': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const sessionId = readRequiredString(data, 'sessionId');
      return workspaceId && sessionId
        ? { type: 'get_session_history', workspaceId, sessionId }
        : null;
    }

    case 'list_dev_servers': {
      const workspaceId = readOptionalString(data, 'workspaceId');
      if (workspaceId === null) return null;
      return workspaceId
        ? { type: 'list_dev_servers', workspaceId }
        : { type: 'list_dev_servers' };
    }

    case 'create_devserver_ticket': {
      const workspaceId = readRequiredString(data, 'workspaceId');
      const port = data.port;
      if (
        !workspaceId ||
        typeof port !== 'number' ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        return null;
      }
      return { type: 'create_devserver_ticket', workspaceId, port };
    }

    case 'voice_status':
      return { type: 'voice_status' };

    case 'voice_transcribe': {
      const audioDataUrl = readRequiredString(data, 'audioDataUrl');
      const mimeType = readOptionalString(data, 'mimeType');
      if (!audioDataUrl || mimeType === null) return null;
      // Reject obviously oversized payloads early. The OpenAI transcription
      // helper enforces the 25 MB decoded ceiling (~33.4 MB base64); this
      // 35 MB cap stays comfortably under the gateway's 36 MB WebSocket
      // payload limit and short-circuits clearly bogus inputs.
      if (audioDataUrl.length > 35 * 1024 * 1024) return null;
      return { type: 'voice_transcribe', audioDataUrl, mimeType };
    }
  }

  return null;
}
