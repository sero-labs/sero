/** Types for the `window.sero` API exposed by the preload script. */

import type {
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  ChatAttachment,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SeroAppManifest,
  SessionUsageStats,
  SessionModelState,
  AuthProvidersResponse,
  OAuthEvent,
  ContainerInfo,
  DevServer,
  DevServerEvent,
  SessionContext,
  ContextOverrides,
  ContextPreset,
  VoiceTranscriptionStatus,
  VoiceTranscriptionResult,
  ResponseFeedbackEntry,
  ResponseFeedbackState,
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from './ipc';
import type {
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  ChangeEntry,
  WorkingCopyStatus,
  FileDiffEntry,
  Bookmark,
  Remote,
  OperationEntry,
  SyncResult,
  PushPreview,
  PullRequestState,
  PullRequestPreview,
  PullRequestDraft,
  CreatePullRequestInput,
  CreatePullRequestResult,
} from './vcs';

interface SeroWorkspaceAPI {
  /** List all registered workspaces (registry + config merged). */
  list(): Promise<WorkspaceInfo[]>;
  /** Create a new workspace. Optionally specify a parent directory for the workspace folder. */
  create(name: string, parentPath?: string): Promise<WorkspaceInfo>;
  /** Unregister a workspace (does not delete files). */
  remove(id: string): Promise<void>;
  /** Get full config for a workspace (.sero-workspace.json). */
  getConfig(id: string): Promise<WorkspaceConfig | null>;
  /** Register an existing folder as a workspace. Creates config if missing. */
  addFolder(folderPath: string, name?: string): Promise<WorkspaceInfo>;
  /** Open workspace in sidebar (persisted). */
  open(id: string): Promise<void>;
  /** Close workspace in sidebar (persisted). */
  close(id: string): Promise<void>;
  /** Open native folder picker. Returns selected path or null. */
  pickFolder(): Promise<string | null>;
  /** Infer best workspace for a message. Returns workspace ID. */
  infer(message: string): Promise<string>;
  /** Enable or disable container mode for a workspace. */
  setContainer(id: string, enabled: boolean): Promise<void>;
}

interface SeroSessionsAPI {
  /** List sessions. Optionally filter by workspace ID. */
  list(workspaceId?: string): Promise<SeroSessionInfo[]>;
  /** Create a session bound to a workspace. Defaults to global. */
  create(workspaceId?: string): Promise<SeroSessionInfo>;
  delete(sessionPath: string): Promise<void>;
}

interface SeroAgentAPI {
  /** Open a session in the agent pool. Creates a workspace-scoped AgentSession. */
  open(sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]>;
  /** Send a prompt to a specific session, optionally with file attachments. */
  prompt(sessionId: string, text: string, attachments?: ChatAttachment[], clientMessageId?: string): Promise<void>;
  /** Steer the agent mid-stream: delivered after the current tool, skips remaining tools in the turn. */
  steer(sessionId: string, text: string, clientMessageId?: string): Promise<void>;
  /** Abort a specific session's current operation. */
  abort(sessionId: string): Promise<void>;
  /** Close a specific session and dispose its AgentSession. */
  close(sessionId: string): Promise<void>;
  /** Get available slash commands for a session. */
  getCommands(sessionId: string): Promise<SeroSlashCommandInfo[]>;
  /** Reload resources (skills, prompts, extensions). Returns updated commands. */
  reloadResources(sessionId: string): Promise<SeroSlashCommandInfo[]>;
  /** Get usage stats (tokens + cost) for a session. */
  getUsage(sessionId: string): Promise<SessionUsageStats | null>;
  /** Get current model + thinking level state. */
  getModelState(sessionId: string): Promise<SessionModelState | null>;
  /** Set the model for a session. */
  setModel(sessionId: string, provider: string, modelId: string): Promise<SessionModelState>;
  /** Set thinking/reasoning level for a session. */
  setThinkingLevel(sessionId: string, level: string): Promise<SessionModelState>;
  /** Get session context (system prompt, tools, skills) for the context editor. */
  getContext(sessionId: string): Promise<SessionContext | null>;
  /** Apply context overrides (disabled tools, system prompt override). Pass null to clear. */
  setContextOverrides(sessionId: string, overrides: ContextOverrides | null): Promise<void>;
  /**
   * Restore a session to a checkpoint: performs VCS file restore,
   * branches the session tree to the checkpoint entry, rebuilds the
   * agent's in-memory messages, and pushes a `messages_loaded` event.
   */
  restoreToCheckpoint(sessionId: string, changeId: string): Promise<ChatMessage[]>;
  /** Subscribe to streaming events pushed from main process. Returns unsubscribe. */
  onEvent(callback: (event: AgentStreamEvent) => void): () => void;
}

interface SeroContextPresetsAPI {
  /** Load all user-saved context editor presets from disk. */
  load(): Promise<ContextPreset[]>;
  /** Save all user context editor presets to disk. */
  save(presets: ContextPreset[]): Promise<void>;
}

interface SeroShellAPI {
  /** Reveal a file or folder in the native file explorer. */
  showItemInFolder(fullPath: string): Promise<void>;
}

interface SeroAppStateAPI {
  /** Read an app state JSON file. */
  read(filePath: string): Promise<unknown>;
  /** Write an app state JSON file (atomic + serialised). */
  write(filePath: string, data: unknown): Promise<void>;
  /** Delete an app state / data file. */
  remove(filePath: string): Promise<void>;
  /** Start watching a state file. Returns current state. */
  watch(filePath: string): Promise<unknown>;
  /** Stop watching a state file. */
  unwatch(filePath: string): Promise<void>;
  /** Subscribe to state file change events. Returns unsubscribe. */
  onChange(callback: (filePath: string, data: unknown) => void): () => void;
}

interface SeroAppsAPI {
  /** Discover all registered Sero apps from installed Pi packages. */
  discover(): Promise<SeroAppManifest[]>;
  /** Subscribe to new app detection events. Returns unsubscribe function. */
  onNewAppDetected(callback: (appName: string) => void): () => void;
}

interface SeroAppAgentAPI {
  /**
   * Send a prompt to an app's dedicated agent session.
   * Returns the full text response. No active chat session required.
   */
  prompt(appId: string, workspaceId: string, text: string): Promise<string>;
}

interface SeroAuthAPI {
  /** Get all providers (OAuth + API key) with auth status. */
  getProviders(): Promise<AuthProvidersResponse>;
  /** Start OAuth login for a provider. Resolves when flow completes. */
  login(providerId: string): Promise<void>;
  /** Logout from a provider (OAuth or API key). */
  logout(providerId: string): Promise<void>;
  /** Save an API key for a provider. */
  setApiKey(providerId: string, key: string): Promise<void>;
  /** Remove a saved API key for a provider. */
  removeApiKey(providerId: string): Promise<void>;
  /** Respond to a pending prompt during login. */
  respondPrompt(value: string): Promise<void>;
  /** Respond to a pending manual code input during login. */
  respondManualCode(value: string): Promise<void>;
  /** Cancel in-progress login. */
  cancel(): Promise<void>;
  /** Subscribe to OAuth flow events. Returns unsubscribe. */
  onEvent(callback: (event: OAuthEvent) => void): () => void;
}

interface SeroVoiceAPI {
  /** Check whether voice transcription is available in this runtime. */
  status(): Promise<VoiceTranscriptionStatus>;
  /** Transcribe a recorded audio data URL. */
  transcribe(audioDataUrl: string, mimeType?: string): Promise<VoiceTranscriptionResult>;
}

interface SeroContainerAPI {
  /** Get container state for a workspace. Returns null if no container. */
  status(workspaceId: string): Promise<ContainerInfo | null>;
  /** Detailed container inspection. */
  inspect(workspaceId: string): Promise<ContainerInfo>;
  /** Ensure a workspace container is running. Creates if needed. Returns null if containers disabled. */
  ensure(workspaceId: string): Promise<ContainerInfo | null>;
}

interface SeroDevServerAPI {
  /** List all registered dev servers. Optionally filter by workspace. */
  list(workspaceId?: string): Promise<DevServer[]>;
  /** Stop a dev server by ID. */
  stop(serverId: string): Promise<void>;
  /** Restart a dev server by ID (stop + re-run original command). */
  restart(serverId: string): Promise<void>;
  /** Unregister a dev server (remove from list without stopping). */
  unregister(serverId: string): Promise<void>;
  /** Open the dev server URL in the default browser. */
  openInBrowser(serverId: string): Promise<void>;
  /** Subscribe to dev server events. Returns unsubscribe. */
  onEvent(callback: (event: DevServerEvent) => void): () => void;
}

interface SeroTerminalAPI {
  /** Create a terminal session in a workspace container. */
  create(workspaceId: string, terminalId: string, cols?: number, rows?: number): Promise<void>;
  /** Send input data to a terminal. */
  write(terminalId: string, data: string): Promise<void>;
  /** Resize a terminal. */
  resize(terminalId: string, cols: number, rows: number): Promise<void>;
  /** Close a terminal session. */
  dispose(terminalId: string): Promise<void>;
  /** Get buffered output for replay when xterm.js remounts. */
  replay(terminalId: string): Promise<string>;
  /** Subscribe to terminal output data. Returns unsubscribe. */
  onData(callback: (terminalId: string, data: string) => void): () => void;
  /** Subscribe to terminal exit events. Returns unsubscribe. */
  onExit(callback: (terminalId: string) => void): () => void;
}

interface SeroLayoutAPI {
  /** Save UI layout state to disk. */
  save(state: { mainSidebarOpen: boolean; chatPanelOpen: boolean }): Promise<void>;
  /** Load UI layout state from disk. Returns null if no saved state. */
  load(): Promise<{ mainSidebarOpen: boolean; chatPanelOpen: boolean } | null>;
}

interface SeroFeedbackAPI {
  /** Load all feedback entries from disk. */
  load(): Promise<ResponseFeedbackState>;
  /** Submit or update a feedback entry. Upserts by messageId. */
  submit(entry: ResponseFeedbackEntry): Promise<void>;
  /** Remove a feedback entry by messageId. */
  remove(messageId: string): Promise<void>;
}

interface SeroUserFeedbackAPI {
  /** Get all currently pending questions (for mount-time hydration). */
  getPending(): Promise<UserFeedbackPendingQuestion[]>;
  /** Send user's answer to a pending question/questionnaire. */
  answer(response: UserFeedbackResponse): Promise<void>;
  /** Listen for incoming question/questionnaire requests from extensions. */
  onQuestion(callback: (data: UserFeedbackPendingQuestion) => void): () => void;
  /** Listen for cancellation of a pending question. */
  onCancel(callback: (data: { id: string }) => void): () => void;
}

interface SeroEditorAPI {
  /** Read a file from the workspace (dual-mode: container or host). */
  readFile(workspaceId: string, filePath: string): Promise<string>;
  /** Write a file to the workspace (dual-mode: container or host). */
  writeFile(workspaceId: string, filePath: string, content: string): Promise<void>;
  /** List files in a directory (dual-mode: container or host). */
  listFiles(workspaceId: string, dirPath: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>>;
  /** Execute a shell command in the workspace (dual-mode). */
  exec(workspaceId: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** Save editor state (open tabs, active tab) for a workspace. */
  saveState(workspaceId: string, state: { openTabs: string[]; activeTab: string | null }): Promise<void>;
  /** Load editor state for a workspace. */
  loadState(workspaceId: string): Promise<{ openTabs: string[]; activeTab: string | null } | null>;
  /** Get the root path for the file tree (e.g. /workspace or host path). */
  getRootPath(workspaceId: string): Promise<string>;
  /** Check if a workspace uses containers. */
  isContainer(workspaceId: string): Promise<boolean>;
  /** Rename/move a file or directory. Returns true on success. */
  rename(workspaceId: string, oldPath: string, newPath: string): Promise<boolean>;
  /** Delete a file or directory recursively. Returns true on success. */
  delete(workspaceId: string, itemPath: string): Promise<boolean>;
  /** Create an empty file. Returns true on success. */
  createFile(workspaceId: string, filePath: string): Promise<boolean>;
  /** Create a directory (recursive). Returns true on success. */
  createDir(workspaceId: string, dirPath: string): Promise<boolean>;
}

interface SeroFileTreeAPI {
  /** Start watching a workspace directory for changes. */
  watch(workspaceId: string): Promise<void>;
  /** Stop watching a workspace directory. */
  unwatch(workspaceId: string): Promise<void>;
  /** Subscribe to file tree change events. Returns unsubscribe. */
  onChanged(callback: (data: { workspaceId: string; directories: string[] }) => void): () => void;
}

interface SeroLspAPI {
  /** Start a language server for a workspace/language. */
  start(workspaceId: string, languageId: string): Promise<{ capabilities: Record<string, unknown>; language: string }>;
  /** Stop a language server. */
  stop(workspaceId: string, language: string): Promise<void>;
  /** Send an LSP request. */
  request(workspaceId: string, language: string, method: string, params?: unknown): Promise<unknown>;
  /** Send an LSP notification (fire-and-forget, no response). */
  notify(workspaceId: string, language: string, method: string, params?: unknown): void;
  /** Check if a server is running for a workspace/language. */
  hasServer(workspaceId: string, language: string): Promise<boolean>;
  /** Subscribe to LSP notifications (diagnostics etc.). Returns unsubscribe. */
  onNotification(callback: (data: { workspaceId: string; language: string; notification: any }) => void): () => void;
  /** Subscribe to LSP server stopped events. Returns unsubscribe. */
  onServerStopped(callback: (data: { workspaceId: string; language: string }) => void): () => void;
}

interface SeroDebugAPI {
  /** Toggle debug logging on/off. Returns new enabled state. */
  toggle(): Promise<boolean>;
  /** Get current debug logging state. */
  getState(): Promise<boolean>;
  /** Open the log file in the native file explorer. */
  openLog(): Promise<void>;
  /** Clear the log file. */
  clearLog(): Promise<void>;
  /** Subscribe to debug state changes. Returns unsubscribe. */
  onStateChanged(callback: (enabled: boolean) => void): () => void;
}

interface SeroVcsAPI {
  /** List recent checkpoints for a workspace. */
  listCheckpoints(workspaceId: string, limit?: number): Promise<VcsCheckpoint[]>;
  /** Get current workspace VCS state (current change + checkpoint list). */
  getState(workspaceId: string, limit?: number): Promise<VcsWorkspaceState>;
  /** Create a checkpoint for the workspace. */
  createCheckpoint(
    workspaceId: string,
    description?: string,
    source?: 'manual' | 'turn' | 'fs' | 'restore',
  ): Promise<VcsCheckpoint | null>;
  /** Restore files to a prior checkpoint snapshot. */
  restore(workspaceId: string, checkpointId: string): Promise<void>;
  /** Get a rich git-format diff between checkpoints. */
  diff(workspaceId: string, fromChangeId: string, toChangeId?: string): Promise<string>;
  /** Start workspace filesystem checkpoint watcher. */
  watch(workspaceId: string): Promise<void>;
  /** Stop workspace filesystem checkpoint watcher. */
  unwatch(workspaceId: string): Promise<void>;
  /** Subscribe to VCS events. Returns unsubscribe. */
  onEvent(callback: (event: VcsEvent) => void): () => void;

  // ── Rich VCS ops ──────────────────────────────────────────
  logEntries(wsId: string, limit?: number, revset?: string): Promise<ChangeEntry[]>;
  status(wsId: string): Promise<WorkingCopyStatus>;
  fileDiffSummary(wsId: string, from: string, to?: string): Promise<FileDiffEntry[]>;
  fileContent(wsId: string, rev: string, path: string): Promise<string>;
  describe(wsId: string, changeId: string, msg: string): Promise<void>;
  bookmarks(wsId: string): Promise<Bookmark[]>;
  createBookmark(wsId: string, name: string, rev?: string): Promise<void>;
  deleteBookmark(wsId: string, name: string): Promise<void>;
  moveBookmark(wsId: string, name: string, toRev: string): Promise<void>;
  remotes(wsId: string): Promise<Remote[]>;
  addRemote(wsId: string, name: string, url: string): Promise<void>;
  removeRemote(wsId: string, name: string): Promise<void>;
  fetch(wsId: string, remote?: string): Promise<SyncResult>;
  push(wsId: string, bookmark?: string, changeId?: string): Promise<SyncResult>;
  pushDryRun(wsId: string, bookmark?: string, changeId?: string): Promise<PushPreview>;
  prState(wsId: string): Promise<PullRequestState>;
  prPreview(wsId: string, sourceBranch?: string, targetBranch?: string): Promise<PullRequestPreview>;
  prGenerateDraft(wsId: string, sourceBranch: string, targetBranch?: string): Promise<PullRequestDraft>;
  prCreate(wsId: string, input: CreatePullRequestInput): Promise<CreatePullRequestResult>;
  undo(wsId: string): Promise<void>;
  abandon(wsId: string, changeId: string): Promise<void>;
  squash(wsId: string, from?: string, into?: string): Promise<void>;
  opLog(wsId: string, limit?: number): Promise<OperationEntry[]>;
}

interface SeroAPI {
  platform: string;
  shell: SeroShellAPI;
  contextPresets: SeroContextPresetsAPI;
  workspace: SeroWorkspaceAPI;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
  appState: SeroAppStateAPI;
  apps: SeroAppsAPI;
  appAgent: SeroAppAgentAPI;
  voice: SeroVoiceAPI;
  auth: SeroAuthAPI;
  container: SeroContainerAPI;
  devServer: SeroDevServerAPI;
  terminal: SeroTerminalAPI;
  layout: SeroLayoutAPI;
  feedback: SeroFeedbackAPI;
  userFeedback: SeroUserFeedbackAPI;
  editor: SeroEditorAPI;
  filetree: SeroFileTreeAPI;
  lsp: SeroLspAPI;
  debug: SeroDebugAPI;
  vcs: SeroVcsAPI;
  github: SeroGitHubAPI;
}

// ── GitHub Auth ──────────────────────────────────────────────

interface GitHubAuthStatus {
  authenticated: boolean;
  username?: string;
  scopes?: string;
}

interface GitHubDeviceFlowEvent {
  type: 'code' | 'polling' | 'success' | 'error';
  userCode?: string;
  verificationUri?: string;
  message?: string;
  username?: string;
}

interface SeroGitHubAPI {
  status(): Promise<GitHubAuthStatus>;
  login(): Promise<void>;
  logout(): Promise<void>;
  cancel(): Promise<void>;
  onEvent(callback: (event: GitHubDeviceFlowEvent) => void): () => void;
}

declare global {
  interface Window {
    sero: SeroAPI;
  }
}

export {};
