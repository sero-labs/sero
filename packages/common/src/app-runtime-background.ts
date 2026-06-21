/**
 * Background app runtime contract — shared between the desktop host and
 * runtime-enabled Sero plugins.
 *
 * This contract is intentionally renderer-safe / Node-agnostic so external
 * plugins can type against it without importing desktop-internal modules.
 */

import type { WorkspaceAccessRootsResult } from './workspace-access-roots';
import type { ExtensionRuntimeContent, ExtensionRuntimeMessage } from './session-runtime';

export interface AppRuntimeStateApi {
  read<T = unknown>(filePath: string): Promise<T | null>;
  update<T = unknown>(filePath: string, updater: (current: T | null) => T): Promise<void>;
  watch(filePath: string): void;
  unwatch(filePath: string): void;
}

export interface AppRuntimeSubagentRunParams {
  agent?: string;
  task: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  parentSessionId: string;
  workspaceId: string;
  cwd?: string;
  isolated?: boolean;
  customTools?: unknown[];
  onUpdate?: (text: string) => void;
  /**
   * Platform tool surface for the subagent session.
   * - 'all' (default): bash, read, write, edit, sero-cli, browser
   * - 'readOnly': the platform read tool only
   * - 'none': no platform tools and no workspace-runtime startup —
   *   the session gets only customTools (enforced via a session tool
   *   allowlist, which also excludes extension-registered tools)
   */
  platformTools?: 'all' | 'readOnly' | 'none';
  /**
   * Optional external cancellation. Aborting resolves the run (never
   * throws) with an `error` beginning with 'Aborted' — 'Aborted' for an
   * in-flight run, 'Aborted before start' for one that never started.
   * Aborting a run still queued for a concurrency slot resolves it
   * promptly without consuming a slot.
   */
  signal?: AbortSignal;
}

export interface AppRuntimeSubagentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AppRuntimeSubagentResult {
  response: string;
  error?: string;
  /** Concrete model id the session ran with (when resolvable; best effort on failure paths). */
  modelId?: string;
  /** Provider id for modelId — model ids are not globally unique. */
  providerId?: string;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs?: number;
  /** Token usage totals (when the provider reports them). */
  usage?: AppRuntimeSubagentUsage;
}

export interface AppRuntimeSubagentsApi {
  runStructured(params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult>;
  onLiveOutput(
    workspaceId: string,
    parentSessionId: string,
    cb: (agentName: string, text: string) => void,
  ): () => void;
}

export interface AppRuntimeNativeBuildFallbackAction {
  type: 'show-install-instructions' | 'switch-workspace-runtime' | 'setup-container-runtime' | 'retry';
  label: string;
  backend?: 'apple-container' | 'docker';
}

export interface AppRuntimeNativeBuildToolsRequiredMetadata {
  code: 'NATIVE_BUILD_TOOLS_REQUIRED';
  title: string;
  message: string;
  installInstructions: string[];
  actions: AppRuntimeNativeBuildFallbackAction[];
  seroInstallable: false;
  failure: {
    kind: string;
    platform: string;
    command: string;
    executable?: string;
    evidence: string;
  };
}

export interface AppRuntimeCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  nativeBuildToolsRequired?: AppRuntimeNativeBuildToolsRequiredMetadata;
}

export interface AppRuntimeRunCommandOptions {
  isolated?: boolean;
}

export interface AppRuntimeWorkspaceRefreshResult {
  refreshed: boolean;
  installCommand?: string;
  dependenciesInstalled: boolean;
  restartedServerIds: string[];
  autoStartedServerId?: string;
  reason?: string;
  nativeBuildToolsRequired?: AppRuntimeNativeBuildToolsRequiredMetadata;
}

export type AppRuntimeWorkspaceRuntimeKind = 'container' | 'host';
export type AppRuntimeWorkspaceRuntimeBackend = 'apple-container' | 'docker' | 'host';
export type AppRuntimeWorkspaceRuntimeFallbackCode = 'container_unavailable' | 'backend-unsupported-on-platform';
export type AppRuntimeWorkspaceRuntimeCapabilityKey =
  | 'browserAutomation'
  | 'containerizedLanguageServers'
  | 'managedDevServers'
  | 'containerMounts';

export interface AppRuntimeWorkspaceRuntimeCapabilityAuditEntry {
  key: AppRuntimeWorkspaceRuntimeCapabilityKey;
  label: string;
  available: boolean;
  containerOnly: boolean;
  detail: string;
}

export interface AppRuntimeWorkspaceRuntimeResolution {
  workspaceId: string;
  workspacePath: string;
  desiredRuntime: AppRuntimeWorkspaceRuntimeKind;
  actualRuntime: AppRuntimeWorkspaceRuntimeKind;
  desiredBackend?: AppRuntimeWorkspaceRuntimeBackend;
  actualBackend?: AppRuntimeWorkspaceRuntimeBackend;
  containerEnabled: boolean;
  fallbackCode?: AppRuntimeWorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
  capabilityAudit: AppRuntimeWorkspaceRuntimeCapabilityAuditEntry[];
}

export interface AppRuntimeWorkspaceInfo {
  id: string;
  name: string;
  /** Absolute host path to the workspace root. */
  path: string;
  open: boolean;
}

export interface AppRuntimeWorkspaceApi {
  runCommand(
    workspaceId: string,
    cwd: string,
    command: string,
    timeoutMs?: number,
    options?: AppRuntimeRunCommandOptions,
  ): Promise<AppRuntimeCommandResult>;
  refreshAfterSync(
    workspaceId: string,
    workspacePath: string,
  ): Promise<AppRuntimeWorkspaceRefreshResult>;
  resolveRuntime(workspaceId: string): Promise<AppRuntimeWorkspaceRuntimeResolution>;
  listAccessRoots(workspaceId: string): Promise<WorkspaceAccessRootsResult>;
  /** All workspaces registered in the active profile (host paths). */
  list(): Promise<AppRuntimeWorkspaceInfo[]>;
}

export interface AppRuntimeVerificationDetectOptions {
  testingEnabled?: boolean;
}

export interface AppRuntimeVerificationCommandResult {
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface AppRuntimeVerificationResult {
  success: boolean;
  results: AppRuntimeVerificationCommandResult[];
}

export interface AppRuntimeVerificationApi {
  detectCompileCommands(workspacePath: string): Promise<string[]>;
  detectDependencyInstallCommand(workspacePath: string): Promise<string | null>;
  detectDevServerCommand(workspacePath: string): Promise<string | null>;
  detectVerificationCommands(
    workspacePath: string,
    options?: AppRuntimeVerificationDetectOptions,
  ): Promise<string[]>;
  runCommands(
    workspaceId: string,
    cwd: string,
    commands: string[],
    timeoutMs?: number,
    options?: AppRuntimeRunCommandOptions,
  ): Promise<AppRuntimeVerificationResult>;
  runDevServerSmokeCheck(
    workspaceId: string,
    cwd: string,
    command: string,
    options?: AppRuntimeRunCommandOptions & { startupTimeoutMs?: number },
  ): Promise<AppRuntimeVerificationCommandResult>;
  summarizeFailure(result: AppRuntimeVerificationCommandResult): string;
}

export interface AppRuntimeWorktreeCreateResult {
  worktreePath: string;
  branchName: string;
  greenfield: boolean;
}

export interface AppRuntimeWorktreeRemoveOptions {
  deleteBranch?: boolean;
  force?: boolean;
}

export interface AppRuntimeConflictResolutionContext {
  attempt: number;
  baseBranch: string;
  upstreamRef: string;
  conflictFiles: string[];
}

export interface AppRuntimeWorktreeSyncOptions {
  resolveConflicts?: (context: AppRuntimeConflictResolutionContext) => Promise<boolean>;
}

export interface AppRuntimeWorktreeSyncResult {
  success: boolean;
  baseBranch?: string;
  upstreamRef?: string;
  updated: boolean;
  resolvedConflicts: boolean;
  error?: string;
}

export interface AppRuntimeWorkspaceSyncResult {
  synced: boolean;
  branch?: string;
  headChanged?: boolean;
  reason?: string;
}

export interface AppRuntimeCreatePullRequestOptions {
  title: string;
  body: string;
  baseBranch?: string;
  draft?: boolean;
}

export type AppRuntimeCreatePullRequestResult =
  | { success: true; url: string; number: number }
  | { success: false; error: string };

export type AppRuntimePullRequestMergeMethod = 'merge' | 'squash' | 'rebase';

export type AppRuntimeMergePullRequestResult =
  | { success: true; state: 'merged' | 'scheduled' }
  | { success: false; error: string };

export type AppRuntimePullRequestMergeState = 'merged' | 'open' | 'closed' | 'unknown';

export interface AppRuntimeWorkspaceStatusResult {
  isGitRepository: boolean;
  hasUncommittedChanges: boolean;
  summary: string;
}

export interface AppRuntimeDirtyWorkspaceStashResult {
  stashRef: string | null;
}

export interface AppRuntimeGitApi {
  createWorktree(
    workspacePath: string,
    cardId: string,
    cardTitle: string,
  ): Promise<AppRuntimeWorktreeCreateResult>;
  removeWorktree(
    workspacePath: string,
    cardId: string,
    options?: AppRuntimeWorktreeRemoveOptions,
  ): Promise<void>;
  /**
   * Workspace-root dirty preflight (Orchestrator workspace-root mode only).
   * Reports whether the registered workspace root has uncommitted changes,
   * ignoring Sero-managed paths under `.sero/`.
   */
  getWorkspaceStatus(workspacePath: string): Promise<AppRuntimeWorkspaceStatusResult>;
  /** Stashes current workspace changes after an explicit user choice. */
  stashWorkspaceChanges(
    workspacePath: string,
    message: string,
  ): Promise<AppRuntimeDirtyWorkspaceStashResult>;
  syncWorktreeWithDefaultBranch(
    worktreePath: string,
    options?: AppRuntimeWorktreeSyncOptions,
  ): Promise<AppRuntimeWorktreeSyncResult>;
  syncWorkspaceRootToDefaultBranch(
    workspacePath: string,
  ): Promise<AppRuntimeWorkspaceSyncResult>;
  createCheckpoint(worktreePath: string, message: string): Promise<string | null>;
  getDiffSummary(worktreePath: string): Promise<string>;
  getDiff(worktreePath: string): Promise<string>;
  pushBranch(worktreePath: string, branchName: string): Promise<boolean>;
  ensureRemoteDefaultBranch(worktreePath: string): Promise<string>;
  createPr(
    worktreePath: string,
    options: AppRuntimeCreatePullRequestOptions,
  ): Promise<AppRuntimeCreatePullRequestResult>;
  mergePr(
    worktreePath: string,
    prNumber: number,
    options?: { method?: AppRuntimePullRequestMergeMethod },
  ): Promise<AppRuntimeMergePullRequestResult>;
  getPrMergeState(
    worktreePath: string,
    prNumber: number,
  ): Promise<AppRuntimePullRequestMergeState>;
  getPrMergeError(worktreePath: string, prNumber: number): Promise<string | null>;
}

export type AppRuntimeDevServerScope = 'workspace' | 'card-preview';
export type AppRuntimeDevServerStatus = 'running' | 'stopped' | 'starting';

export interface AppRuntimeDevServer {
  id: string;
  workspaceId: string;
  name: string;
  port: number;
  url: string;
  framework?: string;
  command: string;
  cwd: string;
  scope: AppRuntimeDevServerScope;
  cardId?: string;
  status: AppRuntimeDevServerStatus;
  registeredAt: string;
}

export interface AppRuntimeStartManagedDevServerOptions {
  workspaceId: string;
  workspacePath: string;
  cwdPath: string;
  command: string;
  name?: string;
  framework?: string;
  scope?: AppRuntimeDevServerScope;
  cardId?: string;
  logPath?: string;
}

export interface AppRuntimeStartManagedDevServerResult {
  serverId?: string;
  url?: string;
  port?: number;
  reason?: string;
}

export interface AppRuntimeDevServersApi {
  startManaged(
    options: AppRuntimeStartManagedDevServerOptions,
  ): Promise<AppRuntimeStartManagedDevServerResult>;
  list(workspaceId: string): AppRuntimeDevServer[];
  stop(serverId: string): Promise<boolean>;
  restart(serverId: string): Promise<boolean>;
  unregister(serverId: string): boolean;
}

export type AppRuntimeNotificationType = 'info' | 'warning' | 'error';

export interface AppRuntimeNotificationOptions {
  message: string;
  type?: AppRuntimeNotificationType;
  source?: string;
  sound?: string | boolean;
  subtitle?: string;
}

export interface AppRuntimeNotificationChoice {
  id: string;
  label: string;
}

export interface AppRuntimeNotificationChoiceResult {
  choiceId: string | null;
  timedOut: boolean;
}

export interface AppRuntimeNotificationChoiceOptions {
  title: string;
  body: string;
  choices: AppRuntimeNotificationChoice[];
  timeoutMs: number;
}

export interface AppRuntimeNotificationsApi {
  notify(options: AppRuntimeNotificationOptions): void;
  /**
   * Shows a visible choice notification and resolves with the chosen id, or
   * `timedOut: true` when the user does not choose within `timeoutMs`.
   */
  requestChoice(
    options: AppRuntimeNotificationChoiceOptions,
  ): Promise<AppRuntimeNotificationChoiceResult>;
}

export interface AppRuntimeProviderApiKey {
  envVar: string;
  key: string;
}

export interface AppRuntimeCredentialsApi {
  /**
   * Resolve the user's API key for a model provider (e.g. 'anthropic').
   * Returns null when the provider is unknown or no key is configured.
   * The key must only be placed in child-process env — never persisted.
   */
  getProviderApiKey(providerId: string): Promise<AppRuntimeProviderApiKey | null>;
}

export interface AppRuntimeToolchainsApi {
  /** Resolve a Sero-managed tool, installing it on demand. Returns the executable path. */
  ensure(tool: string): Promise<{ path: string }>;
  /**
   * Machine-shared directory for an app's tool installs (Python envs, CLIs,
   * model files, …). One copy per machine, shared by every profile — never
   * store tool installs under the profile's SERO_HOME. The directory is
   * created on first call.
   */
  sharedToolsDir(namespace: string): Promise<{ path: string }>;
}

export interface AppRuntimeActiveSession {
  sessionId: string;
  workspaceId: string;
}

export interface AppRuntimeSessionState {
  idle: boolean;
  pendingMessages: number;
  activeTurnId: string | null;
}

export type AppRuntimeTurnStatus = 'completed' | 'aborted' | 'error';

export interface AppRuntimeTurnResult {
  turnId: string;
  status: AppRuntimeTurnStatus;
}

/**
 * Active-session control for background app runtimes (Orchestrator
 * active-session steps). The live session continues under standard Sero
 * session rules; Orchestrator only sends and observes.
 */
export interface AppRuntimeSessionHost {
  getActiveForWorkspace(workspaceId: string): Promise<AppRuntimeActiveSession | null>;
  getState(sessionId: string): Promise<AppRuntimeSessionState>;
  sendUserSteer(
    sessionId: string,
    content: ExtensionRuntimeContent,
    options: { deliverAs: 'steer' | 'followUp'; source: 'orchestrator' },
  ): Promise<{ turnId: string }>;
  sendContextMessage(
    sessionId: string,
    message: ExtensionRuntimeMessage,
    options: { deliverAs: 'steer' | 'followUp' | 'nextTurn'; triggerTurn: boolean; source: 'orchestrator' },
  ): Promise<{ turnId: string | null }>;
  onTurnComplete(sessionId: string, cb: (result: AppRuntimeTurnResult) => void): () => void;
}

export interface AppRuntimeHost {
  appState: AppRuntimeStateApi;
  subagents: AppRuntimeSubagentsApi;
  workspace: AppRuntimeWorkspaceApi;
  verification: AppRuntimeVerificationApi;
  git: AppRuntimeGitApi;
  devServers: AppRuntimeDevServersApi;
  notifications: AppRuntimeNotificationsApi;
  credentials: AppRuntimeCredentialsApi;
  toolchains: AppRuntimeToolchainsApi;
  session: AppRuntimeSessionHost;
}

export interface AppRuntimeContext {
  appId: string;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  host: AppRuntimeHost;
}

export interface AppRuntime {
  start(): Promise<void> | void;
  handleStateChange(state: unknown): Promise<void> | void;
  dispose(): Promise<void> | void;
}

export interface AppRuntimeModule {
  createAppRuntime(ctx: AppRuntimeContext): Promise<AppRuntime> | AppRuntime;
}
