/**
 * Gateway → client push events (streaming).
 *
 * Split out of `protocol.ts` to keep both files within the repo size limit.
 */

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

export type GatewayPushEvent =
  | GatewayAgentStartEvent
  | GatewayAgentEndEvent
  | GatewayTextDeltaEvent
  | GatewayThinkingDeltaEvent
  | GatewayToolInputStartEvent
  | GatewayToolInputDeltaEvent
  | GatewayToolInputEndEvent
  | GatewayToolStartEvent
  | GatewayToolEndEvent
  | GatewayArtifactEvent
  | GatewayDevServerChangedEvent;
