/**
 * Types for the `window.sero` API exposed by the preload script.
 *
 */
import type {
  SeroWorkspaceAPI,
  SeroEditorAPI,
  SeroFileTreeAPI,
  SeroLspAPI,
  SeroDebugAPI,
  SeroVcsAPI,
  SeroOrchestratorAPI,
} from './electron-workspace';
import type { LayoutState, LoadedLayoutState } from './layout';
import type { SeroBrowserAPI } from './electron-browser';
import type {
  SeroGatewayAPI,
  SeroGitHubAPI,
  SeroLocalModelsAPI,
  SeroPluginConfigAPI,
} from './electron-services';
import type { ThemePreset, ThemePresetMeta } from './theme';
import type { SeroAgentPluginsBridge, SeroUserFeedbackBridge } from '@sero-ai/common';
import type {
  ProfileInfo,
  SeroSessionInfo,
  ChatMessage,
  ChatAttachment,
  AgentStreamEvent,
  ChatTurnUndoRef,
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
  SubagentAgentFile,
  InstalledPlugin,
  PluginChangeEvent,
  PluginDevSessionIPC,
  DiscoveredPlugin,
  SkillSummary,
  AvailableSkillSummary,
  SkillFileData,
  PromptTemplateSummary,
  PromptTemplateFileData,
  CollaborationResult,
  CollaborationStateSnapshot,
  CollaborationEvent,
  CollaborationConfig,
  GlobalModelConfigInput,
  GlobalModelConfigState,
  AvailableModelGroup,
  AvailableContext,
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
  OnboardingState,
  TerminalCreateResult,
} from './ipc';
import type { SeroDoctorAPI } from './electron-doctor';
import type { SeroUpdaterAPI } from './electron-updater';
import type { SeroWindowAPI } from './window-chrome';

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
  /** Notify that the user switched away from a session (triggers transcript export). */
  notifySessionSwitch(previousSessionId: string, reason?: 'new' | 'resume'): Promise<void>;
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
  /** Get session context (base system prompt, tools, skills, current overrides) for the context editor. */
  getContext(sessionId: string): Promise<SessionContext | null>;
  /** Apply per-session context overrides (disabled tools/skills, system prompt override). Pass null to clear. */
  setContextOverrides(sessionId: string, overrides: ContextOverrides | null): Promise<void>;
  /**
   * Restore a session to a checkpoint: performs VCS file restore,
   * branches the session tree to the checkpoint entry, rebuilds the
   * agent's in-memory messages, and pushes a `messages_loaded` event.
   */
  restoreToCheckpoint(sessionId: string, changeId: string): Promise<ChatMessage[]>;
  /** Undo a user turn: restore files, rewind the session tree, and prefill the composer. */
  undoToTurn(sessionId: string, turnUndo: ChatTurnUndoRef): Promise<ChatMessage[]>;
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
  /** Open an external URL in the default browser. */
  openExternal(url: string): Promise<void>;
  /** Clear the renderer HTTP cache, used to recover from stale Vite optimized deps. */
  clearRendererCache(): Promise<void>;
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
  /** Respond to a pending selection during login. */
  respondSelect(value: string): Promise<void>;
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
  /** Create a terminal session in a workspace container or host fallback. */
  create(workspaceId: string, terminalId: string, cols?: number, rows?: number): Promise<TerminalCreateResult>;
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
  save(state: LayoutState): Promise<void>;
  /** Load UI layout state from disk. Returns null if no saved state. */
  load(): Promise<LoadedLayoutState | null>;
}

interface SeroDashboardAPI {
  /** Persist or clear the dashboard background image. */
  setBackground(dataUrl: string | null): Promise<void>;
  /** Load the persisted dashboard background image. */
  getBackground(): Promise<string | null>;
  /** Subscribe to dashboard background changes. Returns unsubscribe. */
  onBackgroundChanged(callback: (dataUrl: string | null) => void): () => void;
}

interface SeroThemesAPI {
  /** List all available theme presets (built-in + custom). */
  list(): Promise<ThemePresetMeta[]>;
  /** Load a specific theme preset by ID. */
  load(id: string): Promise<ThemePreset | null>;
  /** Save a custom theme preset (create or update). */
  save(preset: ThemePreset): Promise<void>;
  /** Delete a custom theme preset. */
  delete(id: string): Promise<void>;
  /** Import a theme from a file picker dialog. */
  import(): Promise<ThemePreset | null>;
  /** Export a theme to a file save dialog. */
  export(id: string): Promise<boolean>;
  /** Reset a built-in theme to its original template. Returns the restored preset, or null if not a built-in. */
  reset(id: string): Promise<ThemePreset | null>;
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

interface SeroClipboardAPI { writeText(text: string): Promise<boolean>; }

interface SeroFeedbackAPI {
  /** Load all feedback entries from disk. */
  load(): Promise<ResponseFeedbackState>;
  /** Submit or update a feedback entry. Upserts by messageId. */
  submit(entry: ResponseFeedbackEntry): Promise<void>;
  /** Remove a feedback entry by messageId. */
  remove(messageId: string): Promise<void>;
}

interface SeroUserFeedbackAPI extends SeroUserFeedbackBridge {}

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
  /** Remove all completed/failed/aborted entries for a workspace from the main process. */
  clearCompleted(workspaceId: string): Promise<void>;
  /** Read full agent file data (including system prompt). */
  readAgent(name: string): Promise<SubagentAgentFile>;
  /** Create or update an agent .md file. */
  writeAgent(data: SubagentAgentFile): Promise<void>;
  /** Delete an agent .md file. */
  deleteAgent(name: string): Promise<void>;
}

interface SeroSkillsAPI {
  /** List editable user skills from ~/.sero-ui/agent/skills. */
  listSkills(): Promise<SkillSummary[]>;
  /** List all globally available skills loaded by Sero. */
  listAvailableSkills(): Promise<AvailableSkillSummary[]>;
  /** Persist the set of skills hidden from automatic model invocation. */
  setDisabledModelSkills(skillNames: string[]): Promise<void>;
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
  /** Send a prompt through the collaboration framework (standard or debate). */
  prompt(sessionId: string, workspaceId: string, query: string, config?: CollaborationConfig): Promise<CollaborationResult>;
  /** Get the latest collaboration runtime snapshot for a session. */
  getState(sessionId: string): Promise<CollaborationStateSnapshot | null>;
  /** Subscribe to collaboration lifecycle events. Returns unsubscribe. */
  onEvent(callback: (event: CollaborationEvent) => void): () => void;
}

interface SeroModelsAPI {
  /** List all available models (session-independent). */
  list(): Promise<AvailableModelGroup[]>;
}

interface SeroSubagentContextAPI {
  /** Available context (tools + skills) for a workspace's background subagents, no session. */
  get(workspaceId: string): Promise<AvailableContext>;
}

interface SeroModelConfigAPI {
  /** Read the current global model tiers and validation warnings. */
  get(): Promise<GlobalModelConfigState>;
  /** Persist the global model config to settings.json. */
  set(config: GlobalModelConfigInput): Promise<GlobalModelConfigState>;
}

interface SeroOnboardingAPI {
  /** Run onboarding preflight and return the current onboarding state. */
  getState(): Promise<OnboardingState>;
}

interface SeroProfilesAPI {
  /** List all profiles with active flag. */
  list(): Promise<ProfileInfo[]>;
  /** Get the currently active profile. */
  getActive(): Promise<ProfileInfo | null>;
  /** Check if a valid active profile exists. */
  hasActive(): Promise<boolean>;
  /** Create a new profile. Returns the created profile info. */
  create(name: string, profilePath?: string, copyAuthFromId?: string): Promise<ProfileInfo>;
  /** Switch to a profile. Triggers app restart. */
  switch(id: string): Promise<void>;
  /** Rename a profile's display name. */
  rename(id: string, newName: string): Promise<void>;
  /** Delete a profile (unregister only — files stay). */
  delete(id: string): Promise<void>;
  /** Open native folder picker for custom profile path. */
  pickFolder(): Promise<string | null>;
  /** Check if onboarding is needed for this profile. */
  needsOnboarding(): Promise<boolean>;
  /** Mark onboarding as complete — won't show again. */
  markOnboardingDone(): Promise<void>;
  /** List profiles that have transferable credentials/config available for import. */
  listAuthSources(): Promise<ProfileInfo[]>;
}

interface SeroPluginsAPI {
  /** Install a plugin from a source (npm:pkg, git:url, or local path). */
  install(source: string): Promise<SeroAppManifest>;
  /** Pick a local folder and install its plugin package. */
  installFromFolder(): Promise<SeroAppManifest | null>;
  /** Uninstall a plugin by ID. */
  uninstall(pluginId: string): Promise<void>;
  /** List all installed plugins (from ~/.sero-ui/agent/plugins/). */
  list(): Promise<InstalledPlugin[]>;
  /** Check whether an app ID is an installed plugin (vs core). */
  isPlugin(pluginId: string): Promise<boolean>;
  /** Search for public plugins on GitHub (topic) and npm (keyword). */
  search(query: string): Promise<DiscoveredPlugin[]>;
  listDevSessions(): Promise<PluginDevSessionIPC[]>;
  startDevSession(sourcePath?: string): Promise<PluginDevSessionIPC | null>;
  refreshDevSession(sessionId: string): Promise<PluginDevSessionIPC>;
  stopDevSession(sessionId: string): Promise<void>;
  /** Subscribe to plugin install/dev-session lifecycle events. */
  onChanged(callback: (event: PluginChangeEvent) => void): () => void;
}

export interface SeroAPI {
  platform: string;
  arch: string;
  window: SeroWindowAPI;
  shell: SeroShellAPI;
  profiles: SeroProfilesAPI;
  contextPresets: SeroContextPresetsAPI;
  workspace: SeroWorkspaceAPI;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
  collaboration: SeroCollaborationAPI;
  appState: SeroAppStateAPI;
  apps: SeroAppsAPI;
  appControl: SeroAppControlAPI;
  appAgent: SeroAppAgentAPI;
  webApp: SeroWebAppAPI;
  browser: SeroBrowserAPI;
  voice: SeroVoiceAPI;
  auth: SeroAuthAPI;
  container: SeroContainerAPI;
  devServer: SeroDevServerAPI;
  terminal: SeroTerminalAPI;
  layout: SeroLayoutAPI;
  dashboard: SeroDashboardAPI;
  themes: SeroThemesAPI;
  net: SeroNetAPI;
  safeStorage: SeroSafeStorageAPI;
  gateway: SeroGatewayAPI;
  clipboard: SeroClipboardAPI;
  feedback: SeroFeedbackAPI;
  userFeedback: SeroUserFeedbackAPI;
  editor: SeroEditorAPI;
  filetree: SeroFileTreeAPI;
  lsp: SeroLspAPI;
  debug: SeroDebugAPI;
  vcs: SeroVcsAPI;
  orchestrator: SeroOrchestratorAPI;
  subagent: SeroSubagentAPI;
  skills: SeroSkillsAPI;
  prompts: SeroPromptsAPI;
  github: SeroGitHubAPI;
  models: SeroModelsAPI;
  subagentContext: SeroSubagentContextAPI;
  modelConfig: SeroModelConfigAPI;
  onboarding: SeroOnboardingAPI;
  plugins: SeroPluginsAPI;
  agentPlugins: SeroAgentPluginsBridge;
  localModels: SeroLocalModelsAPI;
  pluginConfig: SeroPluginConfigAPI;
  doctor: SeroDoctorAPI;
  updater: SeroUpdaterAPI;
}

declare global {
  interface Window {
    sero: SeroAPI;
  }
}
export {};
