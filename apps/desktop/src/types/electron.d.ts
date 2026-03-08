/**
 * Types for the `window.sero` API exposed by the preload script.
 *
 * Workspace tool interfaces (editor, filetree, LSP, debug, VCS) are in
 * electron-workspace.d.ts to keep each file under 500 LOC.
 */

/// <reference path="./electron-workspace.d.ts" />

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
  ContextUsageInfo,
  CompactResult,
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
  ProxyFetchRequest,
  ProxyFetchResponse,
  SubagentEvent,
  SubagentAgentSummary,
  SubagentEntry,
  SkillSummary,
  SkillFileData,
  PromptTemplateSummary,
  PromptTemplateFileData,
  CollaborationResult,
  CollaborationEvent,
} from './ipc';

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
  /** Rename a session. Requires the session to be open in the agent pool. */
  rename(sessionId: string, name: string): Promise<void>;
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
  /** Get context window usage (tokens, contextWindow, percent) for a session. */
  getContextUsage(sessionId: string): Promise<ContextUsageInfo | null>;
  /** Trigger manual compaction. Returns success/error + token stats. */
  compact(sessionId: string, customInstructions?: string): Promise<CompactResult>;
  /** Clear session by branching from root (resets conversation, keeps session). */
  clearSession(sessionId: string): Promise<ChatMessage[]>;
  /** Fork session: extract current branch to a new session file. Returns the new session info. */
  forkSession(sessionId: string): Promise<SeroSessionInfo>;
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

interface GogExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  email?: string;
}

interface GoogleAuthEvent {
  type: 'browser' | 'waiting' | 'success' | 'error';
  message: string;
  email?: string;
}

interface SeroGoogleAPI {
  /** Execute a gogcli data command: gog --json --no-input <service> <args>. */
  execute(service: string, subArgs: string[]): Promise<GogExecResult>;
  /** Get current auth status. */
  authStatus(): Promise<GoogleAuthStatus>;
  /** Start OAuth2 sign-in (opens browser). Resolves when complete. */
  login(): Promise<void>;
  /** Sign out. */
  logout(): Promise<void>;
  /** Subscribe to auth flow progress events. Returns unsubscribe. */
  onAuthEvent(callback: (event: GoogleAuthEvent) => void): () => void;
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
  save(state: {
    mainSidebarOpen: boolean;
    chatPanelOpen: boolean;
    favouriteApps: string[];
    mainSidebarSizePct?: number;
    chatPanelSizePct?: number;
  }): Promise<void>;
  /** Load UI layout state from disk. Returns null if no saved state. */
  load(): Promise<{
    mainSidebarOpen: boolean;
    chatPanelOpen: boolean;
    favouriteApps?: string[];
    mainSidebarSizePct?: number;
    chatPanelSizePct?: number;
  } | null>;
}

interface SeroNetAPI {
  /**
   * Proxy an HTTP request through the main process (bypasses CORS).
   * Use this instead of direct fetch() when calling external APIs from app UIs.
   */
  fetch(request: ProxyFetchRequest): Promise<ProxyFetchResponse>;
}

interface SeroSafeStorageAPI {
  /**
   * Encrypt a string using the OS keychain (macOS Keychain / DPAPI).
   * Returns base64-encoded encrypted data. Only decryptable by this app,
   * on this machine, by the current OS user.
   */
  encrypt(plaintext: string): Promise<string>;
  /** Decrypt a safeStorage-encrypted base64 string. */
  decrypt(encryptedBase64: string): Promise<string>;
  /** Check if OS-level encryption is available. */
  available(): Promise<boolean>;
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

// Editor, FileTree, LSP, Debug, and VCS interfaces are in electron-workspace.d.ts

interface SeroSubagentAPI {
  /** Subscribe to live subagent events. Returns unsubscribe function. */
  onEvent(callback: (event: SubagentEvent) => void): () => void;
  /** List all discovered agents. */
  listAgents(): Promise<SubagentAgentSummary[]>;
  /** Get snapshot of all subagent entries for a workspace. */
  snapshot(workspaceId: string): Promise<SubagentEntry[]>;
  /** Abort a specific subagent run. */
  abort(subagentId: string): Promise<void>;
  /** Read full agent file data (including system prompt). */
  readAgent(name: string): Promise<SubagentAgentFile>;
  /** Create or update an agent .md file. */
  writeAgent(data: SubagentAgentFile): Promise<void>;
  /** Delete an agent .md file. */
  deleteAgent(name: string): Promise<void>;
}

interface SeroSkillsAPI {
  /** List all discovered skills (uses SDK loadSkillsFromDir). */
  listSkills(): Promise<SkillSummary[]>;
  /** Read full skill data by absolute filePath (from listSkills). */
  readSkill(filePath: string): Promise<SkillFileData>;
  /** Create or update a skill's SKILL.md. Returns the written filePath. */
  writeSkill(data: SkillFileData): Promise<string>;
  /** Delete a skill directory by the absolute filePath of its SKILL.md. */
  deleteSkill(filePath: string): Promise<void>;
}

interface SeroPromptsAPI {
  /** List all discovered prompt templates (recursive under prompts/). */
  listPrompts(): Promise<PromptTemplateSummary[]>;
  /** Read full prompt template data by absolute filePath. */
  readPrompt(filePath: string): Promise<PromptTemplateFileData>;
  /** Create or update a prompt template. Returns the written filePath. */
  writePrompt(data: PromptTemplateFileData): Promise<string>;
  /** Delete a prompt template by its absolute filePath. */
  deletePrompt(filePath: string): Promise<void>;
}

interface SeroCollaborationAPI {
  /** Send a prompt through the 4-agent collaboration framework. */
  prompt(sessionId: string, workspaceId: string, query: string): Promise<CollaborationResult>;
  /** Subscribe to collaboration lifecycle events. Returns unsubscribe. */
  onEvent(callback: (event: CollaborationEvent) => void): () => void;
}

interface SeroAPI {
  platform: string;
  shell: SeroShellAPI;
  contextPresets: SeroContextPresetsAPI;
  workspace: SeroWorkspaceAPI;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
  collaboration: SeroCollaborationAPI;
  appState: SeroAppStateAPI;
  apps: SeroAppsAPI;
  appAgent: SeroAppAgentAPI;
  google: SeroGoogleAPI;
  voice: SeroVoiceAPI;
  auth: SeroAuthAPI;
  container: SeroContainerAPI;
  devServer: SeroDevServerAPI;
  terminal: SeroTerminalAPI;
  layout: SeroLayoutAPI;
  net: SeroNetAPI;
  safeStorage: SeroSafeStorageAPI;
  feedback: SeroFeedbackAPI;
  userFeedback: SeroUserFeedbackAPI;
  editor: SeroEditorAPI;
  filetree: SeroFileTreeAPI;
  lsp: SeroLspAPI;
  debug: SeroDebugAPI;
  vcs: SeroVcsAPI;
  subagent: SeroSubagentAPI;
  skills: SeroSkillsAPI;
  prompts: SeroPromptsAPI;
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
