/**
 * Background app runtime contract — shared between the desktop host and
 * runtime-enabled Sero plugins.
 *
 * This contract is intentionally renderer-safe / Node-agnostic so external
 * plugins can type against it without importing desktop-internal modules.
 */

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
}

export interface AppRuntimeSubagentResult {
  response: string;
  error?: string;
}

export interface AppRuntimeSubagentsApi {
  runStructured(params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult>;
  onLiveOutput(
    workspaceId: string,
    parentSessionId: string,
    cb: (agentName: string, text: string) => void,
  ): () => void;
}

export interface AppRuntimeCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
}

export type AppRuntimeWorkspaceRuntimeKind = 'container' | 'host';
export type AppRuntimeWorkspaceRuntimeFallbackCode = 'container_unavailable';
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
  containerEnabled: boolean;
  fallbackCode?: AppRuntimeWorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
  capabilityAudit: AppRuntimeWorkspaceRuntimeCapabilityAuditEntry[];
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

export interface AppRuntimeHost {
  appState: AppRuntimeStateApi;
  subagents: AppRuntimeSubagentsApi;
  workspace: AppRuntimeWorkspaceApi;
  verification: AppRuntimeVerificationApi;
  git: AppRuntimeGitApi;
  devServers: AppRuntimeDevServersApi;
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
