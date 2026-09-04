/**
 * Gateway WebSocket protocol — message types and validation.
 *
 * Inspired by OpenClaw's gateway protocol: JSON frames over WebSocket,
 * with typed request/response/push messages.
 */

export * from './protocol-events';

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

export interface GatewaySearchSessionsRequest {
  type: 'search_sessions';
  query: string;
  /** Results wanted. The server caps this. */
  limit?: number;
}

/**
 * Token and cost totals for the sessions the caller can reach.
 * The gateway counts these in memory, from desktop start.
 */
export interface GatewayGetUsageRequest {
  type: 'get_usage';
}

/** The working tree of a workspace. */
export interface GatewayGitStatusRequest {
  type: 'git_status';
  workspaceId: string;
}

/** One file's diff. */
export interface GatewayGitDiffRequest {
  type: 'git_diff';
  workspaceId: string;
  path: string;
  /** Read the staged copy rather than the working tree. */
  staged?: boolean;
}

/** Stage exactly `paths` and commit them. Owner tokens only. */
export interface GatewayGitCommitRequest {
  type: 'git_commit';
  workspaceId: string;
  message: string;
  paths: string[];
}

/** Read the notification feed, newest first. */
export interface GatewayListNotificationsRequest {
  type: 'list_notifications';
  /** Only entries newer than this epoch millisecond value. */
  since?: number;
  limit?: number;
}

/** Mark notifications read for every client. */
export interface GatewayMarkNotificationsReadRequest {
  type: 'mark_notifications_read';
  ids: string[];
}

/** Answer a pending choice from a remote client. */
export interface GatewayAnswerChoiceRequest {
  type: 'answer_choice';
  id: string;
  optionId: string;
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
  | GatewaySearchSessionsRequest
  | GatewayGetUsageRequest
  | GatewayAnswerChoiceRequest
  | GatewayListNotificationsRequest
  | GatewayMarkNotificationsReadRequest
  | GatewayGitStatusRequest
  | GatewayGitDiffRequest
  | GatewayGitCommitRequest
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

// Request validation lives in `request-validation.ts`. It is re-exported
// here so every caller keeps one import for the protocol.
export { validateRequest } from './request-validation';
