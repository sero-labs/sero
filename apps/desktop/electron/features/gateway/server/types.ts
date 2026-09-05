/**
 * Gateway shared types — interfaces used across gateway modules.
 *
 * Extracted from gateway/index.ts to keep file sizes under 500 LOC.
 */

import type { SharedAvailableModelGroup, ThinkingLevel } from '@sero-ai/common';

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

/** How a file changed, as git reports it. */
export type GatewayGitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflict';

/** One changed file in the working tree. */
export interface GatewayGitFile {
  path: string;
  /** The former path of a rename or a copy. */
  oldPath?: string;
  status: GatewayGitFileStatus;
  staged: boolean;
}

/** The working tree of one workspace. */
export interface GatewayGitStatus {
  /** Empty while HEAD is detached. */
  branch: string;
  ahead: number;
  behind: number;
  detached: boolean;
  /** True while a merge is part-way through. */
  merging: boolean;
  files: GatewayGitFile[];
}

/** One line of a diff. */
export interface GatewayGitDiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

/** One run of changed lines. */
export interface GatewayGitDiffHunk {
  oldStart: number;
  newStart: number;
  lines: GatewayGitDiffLine[];
}

/** One file's diff, cut when it is too large to send. */
export interface GatewayGitDiff {
  path: string;
  oldPath?: string;
  status: GatewayGitFileStatus;
  staged: boolean;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: GatewayGitDiffHunk[];
  /** True when lines were dropped to keep the payload sane. */
  truncated: boolean;
}

/** What a finished commit reports back. */
export interface GatewayGitCommitResult {
  /** Short hash. */
  hash: string;
  branch: string;
  fileCount: number;
}

/** Where an uploaded file landed. */
export interface GatewayUploadResult {
  /** The workspace-relative path actually written. */
  path: string;
  bytes: number;
  /** True when the name was taken and a suffix was added. */
  renamed: boolean;
}

/**
 * The model a session runs on, and every model it could switch to.
 *
 * This mirrors the desktop's own model state, so the phone and the
 * desktop show the same list and the same thinking level. It is flat
 * because it crosses a WebSocket.
 */
export interface GatewaySessionModelState {
  provider: string;
  modelId: string;
  /** The model's display name, or 'No models available'. */
  name: string;
  /** True when the model can think. Thinking is off for the rest. */
  reasoning: boolean;
  thinkingLevel: ThinkingLevel;
  /** Thinking levels this model accepts. Empty when it cannot think. */
  availableThinkingLevels: ThinkingLevel[];
  /** Every model with credentials, grouped by provider. */
  availableModels: SharedAvailableModelGroup[];
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
  /**
   * Delete one session's file.
   *
   * The session must belong to `workspaceId`, so a token that reaches
   * one workspace cannot delete another's session. Deleting a session
   * that is already gone succeeds.
   */
  deleteSession(workspaceId: string, sessionId: string): Promise<void>;
  /**
   * The session's model and thinking level, with everything it could
   * switch to.
   *
   * This opens the session in the pool if it is not open yet, the same
   * way a prompt does. The phone reads the model before its first
   * prompt, so there would otherwise be nothing to read.
   */
  getSessionModel(
    sessionId: string,
    workspaceId: string,
  ): Promise<GatewaySessionModelState>;
  /**
   * Switch the session to another model. The session must be open, and
   * the model must have credentials.
   */
  setSessionModel(
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<GatewaySessionModelState>;
  /** Set the session's thinking level. The session must be open. */
  setSessionThinkingLevel(
    sessionId: string,
    level: string,
  ): Promise<GatewaySessionModelState>;
  /** The working tree of a workspace: branch, tracking counts, changed files. */
  gitStatus(workspaceId: string): Promise<GatewayGitStatus>;
  /** One file's diff, cut when it is too large to send. */
  gitDiff(workspaceId: string, filePath: string, staged: boolean): Promise<GatewayGitDiff | null>;
  /**
   * Stage exactly `paths` and commit them.
   *
   * Owner tokens only, enforced by the handler. Nothing outside `paths`
   * is staged, so a phone can never sweep up a change it did not show.
   */
  gitCommit(
    workspaceId: string,
    message: string,
    paths: string[],
  ): Promise<GatewayGitCommitResult>;
  /** List files in a workspace directory. */
  listFiles(workspaceId: string, dirPath: string): Promise<GatewayFileEntry[]>;
  /** Read a file from a workspace. */
  readFile(workspaceId: string, filePath: string): Promise<GatewayFileContent>;
  /**
   * Write an uploaded file into a workspace.
   *
   * It lands in `uploads/` unless the caller names a directory, and it
   * never overwrites: a taken name gets a numeric suffix.
   */
  uploadFile(
    workspaceId: string,
    filePath: string,
    contentBase64: string,
  ): Promise<GatewayUploadResult>;
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
