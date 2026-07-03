/**
 * Background app runtime contract — shared between the desktop host and
 * runtime-enabled Sero plugins.
 *
 * This contract is intentionally renderer-safe / Node-agnostic so external
 * plugins can type against it without importing desktop-internal modules.
 */

import type { WorkspaceAccessRootsResult } from './workspace-access-roots';
import type { ExtensionRuntimeContent, ExtensionRuntimeMessage } from './session-runtime';
import type { SharedAvailableModelGroup } from './model-selection/types';
import type { ContextAgentInfo, ContextToolInfo } from './context-editor';
import type { AppRuntimeGitApi } from './app-runtime-git';

// The git surface lives in ./app-runtime-git; re-exported here so existing
// imports from '@sero-ai/common' (via this module) keep resolving unchanged.
export type {
  AppRuntimeWorktreeCreateResult,
  AppRuntimeWorktreeCreateOptions,
  AppRuntimeWorktreeRemoveOptions,
  AppRuntimeConflictResolutionContext,
  AppRuntimeWorktreeSyncOptions,
  AppRuntimeWorktreeSyncResult,
  AppRuntimeWorkspaceSyncResult,
  AppRuntimeCreatePullRequestOptions,
  AppRuntimeCreatePullRequestResult,
  AppRuntimePullRequestMergeMethod,
  AppRuntimeMergePullRequestResult,
  AppRuntimePullRequestMergeState,
  AppRuntimePullRequestSummary,
  AppRuntimeWorkspaceStatusResult,
  AppRuntimeDirtyWorkspaceStashResult,
  AppRuntimeGitApi,
} from './app-runtime-git';

export interface AppRuntimeStateApi {
  read<T = unknown>(filePath: string): Promise<T | null>;
  update<T = unknown>(filePath: string, updater: (current: T | null) => T): Promise<void>;
  watch(filePath: string): void;
  unwatch(filePath: string): void;
  /**
   * Resolve (creating on first use) a profile-global app-state directory at
   * `$SERO_HOME/apps/<namespace>/`. Unlike the per-workspace `stateFilePath`,
   * this is shared across every workspace in the active profile — the home for
   * cross-workspace stores (e.g. the Orchestrator Loop Library). Read/update/watch
   * still operate on the concrete file paths under it.
   */
  globalDir(namespace: string): Promise<{ path: string }>;
}

/**
 * In-session structured-output repair. After the agent replies, `validate` is
 * called with the reply text: return null to accept it, or a follow-up message
 * to send IN THE SAME session (reusing its context and tools — no new subagent)
 * for another reply. Repeated up to `maxAttempts` times, then the last reply is
 * returned as-is. Callbacks run in-process, so this is for runtime (host.*)
 * callers, not serialized renderer/IPC callers.
 */
export interface AppRuntimeSubagentRepair {
  maxAttempts: number;
  validate: (reply: string) => string | null;
}

export interface AppRuntimeSubagentRunParams {
  agent?: string;
  task: string;
  model?: string;
  thinking?: string;
  repair?: AppRuntimeSubagentRepair;
  timeoutMs?: number;
  /** Appended after the base system prompt (e.g. an agent body / step contract). */
  systemPrompt?: string;
  /**
   * Replaces the base system prompt for this run (user context override). An
   * empty string excludes the base prompt entirely. The `systemPrompt` suffix
   * (if any) still applies on top, so callers keep their non-negotiable rules.
   */
  systemPromptOverride?: string;
  /**
   * Extra system-prompt sections appended AFTER the resolved agent body — for a
   * caller's non-negotiable rules (e.g. the Orchestrator's step-outcome contract)
   * that must survive even when a named `agent` is used. Unlike `systemPrompt`
   * (which the resolver treats as an ad-hoc agent body and is dropped once a named
   * `agent` is set), these always ride on top of whatever agent is resolved.
   */
  appendSystemPrompt?: string[];
  parentSessionId: string;
  workspaceId: string;
  cwd?: string;
  isolated?: boolean;
  customTools?: unknown[];
  /**
   * Allowlist of tool names this run may use. When set, the session activates
   * only these tools (and the SDK ignores any name it doesn't recognise), which
   * also trims the per-tool prompt guidance. Omitted = the full platform surface.
   */
  tools?: string[];
  /** Tool names to remove from this run's tool surface (user context override). */
  disabledTools?: string[];
  /** Skill names to hide from the model for this run (user context override). */
  disabledSkills?: string[];
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
  /** Run cost in USD, when the provider/model has known pricing. */
  costUsd?: number;
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
  /**
   * The real tool surface a background subagent loads in this workspace (name +
   * description), so callers (e.g. the Orchestrator planner) can pick a step's
   * tools from the actual catalog rather than a hardcoded list.
   */
  listToolCatalog(workspaceId: string): Promise<ContextToolInfo[]>;
  /**
   * The named agent roles available in this workspace, so callers (e.g. the
   * Orchestrator planner and its per-step agent picker) can choose a role from
   * the real catalog rather than guessing names.
   */
  listAgentCatalog(workspaceId: string): Promise<ContextAgentInfo[]>;
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

export interface AppRuntimeModelsApi {
  /**
   * Lists the models currently available to this machine (every provider with a
   * configured key), grouped by provider. Background runtimes use this to resolve
   * a step's chosen model before running and to detect a pinned model that is no
   * longer installed. Tier aliases ('LOW' | 'MED' | 'HIGH') are resolved by the
   * subagent runner, not listed here.
   */
  list(): Promise<SharedAvailableModelGroup[]>;
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
  ): Promise<{ turnId: string | null }>;
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
  models: AppRuntimeModelsApi;
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
