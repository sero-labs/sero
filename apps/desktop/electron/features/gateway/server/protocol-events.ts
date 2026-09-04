/**
 * Gateway → client push events (streaming).
 *
 * Split out of `protocol.ts` to keep both files within the repo size limit.
 */

export interface GatewayAgentStartEvent {
  type: 'agent_start';
  /** The session's workspace. Used for scope filtering. */
  workspaceId: string;
  sessionId: string;
}

export interface GatewayAgentEndEvent {
  type: 'agent_end';
  /** The session's workspace. Used for scope filtering. */
  workspaceId: string;
  sessionId: string;
}

/** What a session is doing. Drives the session-row state dot. */
export type GatewaySessionState = 'running' | 'idle' | 'awaiting_input';

/**
 * A session changed state. Sent to every client whose token can reach
 * the workspace, whether or not the client is viewing that session.
 */
export interface GatewaySessionStateEvent {
  type: 'session_state';
  workspaceId: string;
  sessionId: string;
  state: GatewaySessionState;
  /** Epoch milliseconds. */
  ts: number;
}

/** Maximum length of the `turn_complete` snippet, in characters. */
export const TURN_SNIPPET_MAX = 140;

/**
 * A turn finished. Carries at most `TURN_SNIPPET_MAX` characters of the
 * agent's last message so a list UI can show what happened without
 * asking for the history.
 */
export interface GatewayTurnCompleteEvent {
  type: 'turn_complete';
  workspaceId: string;
  sessionId: string;
  /** Epoch milliseconds. */
  ts: number;
  outcome: 'completed' | 'cancelled' | 'error';
  snippet?: string;
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

/**
 * The model has begun streaming a tool call's arguments. The tool has not run
 * yet — `tool_start` still follows once the arguments are complete.
 */
export interface GatewayToolInputStartEvent {
  type: 'tool_input_start';
  sessionId: string;
  /** Identifies the stream until the real tool call id arrives. */
  streamKey: string;
  toolName: string;
}

export interface GatewayToolInputDeltaEvent {
  type: 'tool_input_delta';
  sessionId: string;
  streamKey: string;
  delta: string;
  /** True when `delta` replaces the buffer rather than extending it. */
  replace: boolean;
  path: string | null;
}

export interface GatewayToolInputEndEvent {
  type: 'tool_input_end';
  sessionId: string;
  streamKey: string;
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

/** One answer a choice offers. */
export interface GatewayChoiceOption {
  id: string;
  label: string;
  description?: string;
}

/**
 * An agent is waiting for an answer.
 *
 * A choice that names a workspace goes to every token that reaches it.
 * A choice with no workspace goes to owner tokens only.
 */
export interface GatewayChoiceRequestEvent {
  type: 'choice_request';
  id: string;
  workspaceId?: string;
  title: string;
  body: string;
  options: GatewayChoiceOption[];
  /** ISO 8601. When the choice times out, if it does. */
  expiresAt?: string;
  /** What happens when the timeout expires. */
  fallbackLabel?: string;
  /** Where the choice came from, for example "Sero Orchestrator". */
  source?: string;
  ts: number;
}

/**
 * A choice is over. Every client dismisses it, whoever answered.
 */
export interface GatewayChoiceResolvedEvent {
  type: 'choice_resolved';
  id: string;
  workspaceId?: string;
  outcome: 'answered' | 'cancelled';
  /** The option chosen. Absent when the choice was cancelled. */
  optionId?: string;
  ts: number;
}

/**
 * A new notification.
 *
 * An entry that names a workspace goes to every token that reaches it.
 * An entry with no workspace goes to owner tokens only.
 */
export interface GatewayNotificationEvent {
  type: 'notification';
  id: string;
  /** Milliseconds since the epoch. */
  ts: number;
  source: string;
  notificationType: 'info' | 'warning' | 'error';
  message: string;
  workspaceId?: string;
  read: boolean;
}

/** Entries were marked read, so every client clears its badge. */
export interface GatewayNotificationsReadEvent {
  type: 'notifications_read';
  ids: string[];
  ts: number;
}

export type GatewayPushEvent =
  | GatewayAgentStartEvent
  | GatewayAgentEndEvent
  | GatewaySessionStateEvent
  | GatewayTurnCompleteEvent
  | GatewayTextDeltaEvent
  | GatewayThinkingDeltaEvent
  | GatewayToolInputStartEvent
  | GatewayToolInputDeltaEvent
  | GatewayToolInputEndEvent
  | GatewayToolStartEvent
  | GatewayToolEndEvent
  | GatewayArtifactEvent
  | GatewayChoiceRequestEvent
  | GatewayChoiceResolvedEvent
  | GatewayNotificationEvent
  | GatewayNotificationsReadEvent
  | GatewayDevServerChangedEvent;
