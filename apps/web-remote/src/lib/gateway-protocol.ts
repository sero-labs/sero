/**
 * Gateway protocol types, as the browser sees them.
 *
 * A mirror of `electron/gateway/protocol.ts`. Nothing here runs: the
 * transport and the client both import from here so the wire shapes
 * live in one place.
 */

export interface GatewayOkResponse {
  type: 'ok';
  requestType: string;
  /** Correlation id echoed by the host for request/response pairing. */
  requestId?: string;
  data?: unknown;
}

export interface GatewayErrorResponse {
  type: 'error';
  requestType: string;
  /** Correlation id echoed by the host for request/response pairing. */
  requestId?: string;
  message: string;
}

export interface VoiceTranscriptionStatus {
  enabled: boolean;
  reason?: string;
}

export interface VoiceTranscriptionResult {
  text: string;
  model: string;
}

export type GatewayResponse = GatewayOkResponse | GatewayErrorResponse;

/** What a session is doing. Mirrors `GatewaySessionState` on the host. */
export type SessionState = 'running' | 'idle' | 'awaiting_input';

export interface GatewayPushEvent {
  type:
    | 'agent_start'
    | 'agent_end'
    | 'session_state'
    | 'turn_complete'
    | 'text_delta'
    | 'thinking_delta'
    | 'tool_input_start'
    | 'tool_input_delta'
    | 'tool_input_end'
    | 'tool_start'
    | 'tool_end'
    | 'artifact_added'
    | 'choice_request'
    | 'choice_resolved'
    | 'notification'
    | 'notifications_read'
    | 'notifications_dismissed'
    | 'app_state_changed'
    | 'file_tree_changed'
    | 'dev_server_changed';
  /** Present on session-bound events; absent on workspace-bound events like dev_server_changed. */
  sessionId?: string;
  /** Present on workspace-scoped events: session_state, turn_complete, agent_start, agent_end. */
  workspaceId?: string;
  [key: string]: unknown;
}

export type GatewayMessage = GatewayResponse | GatewayPushEvent;

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'reconnecting'
  | 'connected';

export interface DisconnectEvent {
  code: number;
  reason: string;
  willReconnect: boolean;
}

export type MessageHandler = (msg: GatewayMessage) => void;

// ── Request types ───────────────────────────────────────────────

export interface GatewayRequest {
  type: string;
  [key: string]: unknown;
}
