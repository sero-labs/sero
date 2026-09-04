/**
 * Gateway shared types — interfaces used across gateway modules.
 *
 * Extracted from gateway/index.ts to keep file sizes under 500 LOC.
 */

export interface GatewayConfig {
  /** Port for the WebSocket server. Default: 18800. */
  port: number;
  /**
   * Port for the dev-server preview listener. Previews are served from
   * their own origin so the sandboxed preview iframe (allow-same-origin)
   * stays isolated from the web-remote SPA's origin — previewed app code
   * must not be able to reach the SPA's storage or gateway session.
   */
  previewPort: number;
  /**
   * HTTPS port the preview listener is mapped to when the gateway is
   * exposed over the tailnet (`tailscale serve --https=<this> <previewPort>`).
   * TLS-connected clients build preview URLs against this port.
   */
  previewTlsPort: number;
  /** Bind host. Default: '127.0.0.1' (localhost only). */
  host: string;
  /** Path to the auth token file. */
  tokenPath: string;
  /** Directory for gateway config files (cost limits, etc.). */
  configDir: string;
}

/** File entry returned by listFiles. */
export interface GatewayFileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size: number;
}

/** File content returned by readFile. */
export interface GatewayFileContent {
  content: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  size: number;
}

/**
 * Information about a registered dev server, returned to gateway clients.
 * Mirrors the shape of `DevServer` from the desktop IPC types.
 */
export interface GatewayDevServerInfo {
  id: string;
  workspaceId: string;
  name: string;
  port: number;
  framework?: string;
  status: 'running' | 'stopped' | 'starting' | 'failed';
  registeredAt: string;
}

/**
 * Resolved upstream target for proxying a workspace dev server.
 * Returned by `resolveDevServerTarget` only when the server is registered
 * AND the port scanner has a fresh listening port for it.
 */
export interface GatewayDevServerTarget {
  workspaceId: string;
  port: number;
  /** Runtime-provided host for the provider-neutral preview URL. */
  host: string;
  /** Effective host port from the runtime preview URL. */
  upstreamPort: number;
}

/** Lightweight change event mirrored from the dev server registry. */
export type GatewayDevServerChange =
  | { type: 'registered'; workspaceId: string; server: GatewayDevServerInfo }
  | { type: 'unregistered'; serverId: string; workspaceId: string }
  | {
      type: 'status_changed';
      serverId: string;
      workspaceId: string;
      status: GatewayDevServerInfo['status'];
    };

/**
 * A session as the session list shows it. `updatedAt` and `messageCount`
 * fill the session-row subtitle; `workspaceId` lets the client file the
 * session under the right workspace in the tree.
 */
export interface GatewaySessionInfo {
  id: string;
  name: string;
  firstMessage?: string;
  workspaceId: string;
  /** ISO 8601. Last time the session file changed. */
  updatedAt: string;
  messageCount: number;
}

/**
 * One session that matched a search, with the text around the first hit.
 */
export interface GatewaySessionSearchResult {
  sessionId: string;
  workspaceId: string;
  name: string;
  /** Text around the first match, with elided ends marked by "…". */
  snippet: string;
  matchCount: number;
  /** ISO 8601. Last time the session file changed. */
  updatedAt: string;
}

/** Operations the gateway can delegate to the agent pool. */
export interface GatewayAgentOps {
  /** Open or get an existing agent session. Returns session path. */
  openSession(
    sessionId: string,
    workspaceId: string,
  ): Promise<void>;
  /** Send a prompt to an agent session. */
  prompt(
    sessionId: string,
    text: string,
    images?: Array<{ data: string; mimeType: string }>,
  ): Promise<void>;
  /** Steer an active agent. */
  steer(sessionId: string, text: string): Promise<void>;
  /** Abort an active agent. */
  abort(sessionId: string): Promise<void>;
  /** List workspaces. */
  listWorkspaces(): Promise<Array<{ id: string; name: string; path: string }>>;
  /**
   * The workspace an open session belongs to, or null when the session
   * is not in the pool. Synchronous: the event-forwarding path needs the
   * workspace id to scope push events, and cannot await.
   */
  getSessionWorkspaceId(sessionId: string): string | null;
  /** List sessions for a workspace. */
  listSessions(workspaceId: string): Promise<GatewaySessionInfo[]>;
  /**
   * Search sessions in the given workspaces for `query`.
   *
   * The caller passes only the workspaces its token can reach; this
   * operation applies no authorization of its own.
   */
  searchSessions(
    workspaceIds: string[],
    query: string,
    limit: number,
  ): Promise<GatewaySessionSearchResult[]>;
  /** Create a new session for a workspace. */
  createSession(workspaceId: string, name?: string): Promise<GatewaySessionInfo>;
  /** List files in a workspace directory. */
  listFiles(workspaceId: string, dirPath: string): Promise<GatewayFileEntry[]>;
  /** Read a file from a workspace. */
  readFile(workspaceId: string, filePath: string): Promise<GatewayFileContent>;
  /** List artifacts for a session. */
  listArtifacts(sessionId: string): Promise<Array<{ id: string; type: string; title: string; timestamp: string; mimeType: string }>>;
  /** Get artifact data by ID. */
  getArtifact(artifactId: string): Promise<{ base64: string; mimeType: string; title: string } | null>;
  /** Get message history for a session. */
  getSessionHistory(
    workspaceId: string,
    sessionId: string,
  ): Promise<Array<{
    id: string;
    type: 'user' | 'assistant' | 'system';
    text: string;
    thinking?: string;
    images?: Array<{ base64: string; mimeType: string }>;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      state: 'done' | 'error';
      output?: string;
      images?: Array<{ data: string; mimeType: string; description?: string }>;
    }>;
    timestamp: number;
  }>>;

  /**
   * List dev servers registered by agents. Used to populate the
   * remote preview UI. Filtering by workspace is optional; callers
   * still apply per-workspace authorization on top.
   */
  listDevServers(workspaceId?: string): Promise<GatewayDevServerInfo[]>;

  /**
   * Resolve a registered dev server to a reachable upstream target.
   * Returns null when the port is not registered for this workspace
   * or the port scanner has no live listener for it. The proxy uses
   * this to refuse arbitrary ports — only registered ones are exposed.
   */
  resolveDevServerTarget(
    workspaceId: string,
    port: number,
  ): Promise<GatewayDevServerTarget | null>;

  /**
   * Subscribe to dev server registry changes. Returns an unsubscribe.
   * The gateway forwards these to clients as `dev_server_changed`
   * push events, scoped by workspace authorization.
   */
  onDevServerChange(cb: (change: GatewayDevServerChange) => void): () => void;
}
