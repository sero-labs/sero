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
import type { AppRuntimeGitApi } from './app-runtime-git';
import type { AppRuntimeNotificationsApi } from './app-runtime-notifications';
import type { PersistentSessionsApi } from './app-runtime-persistent-sessions';
import type { AppRuntimeSubagentsApi } from './app-runtime-subagents';

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
  AppRuntimeIssueSummary,
  AppRuntimeWorkspaceStatusResult,
  AppRuntimeDirtyWorkspaceStashResult,
  AppRuntimeGitApi,
} from './app-runtime-git';

export type {
  AppRuntimeSubagentRepair,
  AppRuntimeSubagentRunParams,
  AppRuntimeSubagentUsage,
  AppRuntimeSubagentResult,
  AppRuntimeSubagentsApi,
} from './app-runtime-subagents';

export interface AppRuntimeStateApi {
  read<T = unknown>(filePath: string): Promise<T | null>;
  update<T = unknown>(filePath: string, updater: (current: T | null) => T): Promise<void>;
  remove(filePath: string): Promise<void>;
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

export interface AppRuntimePreparedImage {
  /** Base64, no data: prefix. */
  data: string;
  mimeType: string;
  /**
   * Any caption passed in, plus a note giving the original dimensions when the
   * image was scaled — so the model can map coordinates back.
   */
  text?: string;
  /** False when the image was already inside the budget and passed through. */
  wasResized: boolean;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface AppRuntimeMediaApi {
  /**
   * Shrink an image to the same budget the desktop app's own tools use before
   * handing it to a model — capped dimensions, re-encoded as whichever of PNG
   * or JPEG comes out smaller, degrading quality and then size until it fits.
   *
   * Any runtime that puts an image in front of a model should go through this.
   * A full-resolution screenshot costs a large share of the context window and
   * can exceed the provider's own limit, and both are silent failures: the
   * first just makes everything after it worse, the second arrives as an
   * unhelpful API error.
   */
  prepareImage(
    data: string,
    mimeType: string,
    text?: string,
  ): Promise<AppRuntimePreparedImage>;
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

/** A user skill in the active profile. */
export interface AppRuntimeSkillSummary {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
}

/**
 * A skill a runtime asks the host to write.
 *
 * A caller supplies a NAME, never a path: the host derives the target from it,
 * so a traversal is impossible by construction rather than by check.
 */
export interface AppRuntimeSkillWrite {
  /** Must match ^[a-z0-9][a-z0-9-]*$ — it is also the directory name. */
  name: string;
  /** Frontmatter description. This is the skill's trigger text. */
  description: string;
  /** Markdown body after the frontmatter. */
  body: string;
  /** Optional provenance, written as a flat `origin` frontmatter key. */
  origin?: string;
  /** An existing skill of this name is refused unless this is true. */
  overwrite?: boolean;
  /**
   * The renderer-issued approval that permits this write, naming what the user
   * reviewed (`<loopId>:<draftId>`). The host matches it against a hash of the
   * content and consumes it once. A runtime action is reachable by a model, so
   * without this a write no person approved would be indistinguishable from one
   * they did.
   */
  approval: { scope: string };
}

export interface AppRuntimeSkillWriteResult {
  filePath: string;
  /** False when an existing skill was replaced. */
  created: boolean;
}

/**
 * Read/write access to the profile's user skills.
 *
 * A skill file is prompt content loaded into every agent session, so this is a
 * real privilege: the host installs it only for a bundled plugin that passes
 * the built-in gate (the same rule `persistentSessions` follows). Declaring
 * `appRuntime.skills` in a manifest does not produce it.
 */
export interface AppRuntimeSkillsApi {
  list(): Promise<AppRuntimeSkillSummary[]>;
  /**
   * Writes `<SERO_AGENT_DIR>/skills/<name>/SKILL.md` atomically and hot-reloads
   * active sessions, exactly as the Admin skill editor's write does.
   */
  write(skill: AppRuntimeSkillWrite): Promise<AppRuntimeSkillWriteResult>;
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
  /** Optional for compatibility with hosts that predate media support. */
  media?: AppRuntimeMediaApi;
  session: AppRuntimeSessionHost;
  /**
   * Host-managed persistent Pi sessions (AD-029).
   *
   * Optional and normally ABSENT: the host installs it only for a bundled
   * first-party plugin that passes the built-in gate. Declaring
   * `appRuntime.persistentSessions` in a manifest does not produce it — that
   * list is a compatibility declaration, not an authorisation. Always check for
   * the property before use.
   */
  persistentSessions?: PersistentSessionsApi;
  /**
   * User-skill read/write (spec 18 — skill extraction).
   *
   * Optional and normally ABSENT, on the same rule as `persistentSessions`: the
   * host installs it only for a bundled plugin that passes the built-in gate.
   * Always check for the property before use.
   */
  skills?: AppRuntimeSkillsApi;
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
