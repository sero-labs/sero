/**
 * Shared IPC type definitions.
 *
 * Imported by both Electron main process and renderer.
 * Each domain gets a channel prefix and typed payloads.
 */

// ── Profiles ───────────────────────────────────────────────────

export type { ProfileInfo } from './profile';
// ── Workspaces ─────────────────────────────────────────────────
export type { WorkspaceRuntimeBackend, WorkspaceRuntimeConfig } from './workspace-runtime';
import type { WorkspaceRuntimeConfig } from './workspace-runtime';

/** Entry in the workspace registry (~/.sero-ui/agent/workspaces.json). */
export interface WorkspaceRegistryEntry {
  /** Unique ID (kebab-case slug). */
  id: string;
  /** Absolute path to workspace root. */
  path: string;
  /** Whether the workspace tree node is expanded in the sidebar. */
  open: boolean;
}

/**
 * An additional root attached to a workspace.
 *
 * The workspace's primary path is implicitly root id `"workspace"`. Each
 * additional root is a host directory that the renderer + agent can browse
 * and edit alongside the primary root, with its own sandbox.
 *
 * In container mode each extra root is bind-mounted into the workspace
 * container at the same host absolute path so virtual paths translate
 * directly without coordinate transforms.
 */
export interface WorkspaceRoot {
  /** Stable kebab-case slug, unique within the workspace. Used as virtual path prefix. */
  id: string;
  /** Human-readable label shown in the explorer header. */
  name: string;
  /** Absolute host path. Resolved + validated when the root is added. */
  path: string;
  /**
   * Marker so the Plugin Manager (and other UI) can distinguish roots
   * created via "Link plugin" from generic additional roots. Defaults
   * to `"folder"` when omitted.
   */
  kind?: 'folder' | 'linked-plugin';
}

/** Workspace info surfaced to the renderer. Registry entry + config merged. */
export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  description?: string;
  contextHints?: string[];
  tags?: string[];
  open: boolean;
  /** Provider-aware runtime selection for this workspace. */
  runtime: WorkspaceRuntimeConfig;
  /** Derived compatibility flag while renderer code migrates to runtime.backend. */
  container: boolean;
  /** IDs of other workspaces mounted into this workspace's container. */
  references: string[];
  /** Arbitrary host folders mounted read-write into this workspace's container. */
  mounts: string[];
  /** Additional roots attached to this workspace (multi-root explorer). */
  roots: WorkspaceRoot[];
  missing?: boolean; // Registry path is currently unavailable (e.g. removable media).
}

export interface WorkspaceCreateOptions {
  /** Use a new or empty destination instead of reusing a non-empty directory. */
  requireEmpty?: boolean;
}

/**
 * Root surfaced to the editor IPC. Each entry has the virtual prefix
 * (e.g. `/workspace`, `/sero-source`) the renderer should use when
 * issuing file IPC calls.
 */
export interface EditorRoot {
  /** Stable id (`workspace` for the primary root). */
  id: string;
  /** Display name. */
  name: string;
  /** Virtual path prefix consumed by `editor.*` IPC. */
  virtualPath: string;
  /** Marker matching `WorkspaceRoot.kind`. */
  kind?: 'workspace' | 'folder' | 'linked-plugin';
}

/** Full workspace config from .sero-workspace.json at workspace root. */
export interface WorkspaceConfig {
  id: string;
  name: string;
  description?: string;
  /** Provider-aware runtime selection. */
  runtime?: WorkspaceRuntimeConfig;
  /** @deprecated read-only migration input; writes use runtime.backend. */
  container?: boolean;
  /** Default cwd relative to workspace root for new sessions. */
  defaultCwd?: string;
  /** Context hints injected into system prompt when workspace is open. */
  contextHints?: string[];
  /** Paths to workspace-specific skills (relative to workspace root). */
  skills?: string[];
  /** Files always included in AI context when workspace is open. */
  contextFiles?: string[];
  /** Globs to exclude from AI indexing. */
  exclude?: string[];
  /** Tags for categorisation and inference. */
  tags?: string[];
  /**
   * IDs of other workspaces whose directories are mounted into this
   * workspace's container. By default containers run in isolated mode
   * with no cross-workspace access; adding a reference explicitly grants
   * read-write access to the referenced workspace's files.
   */
  references?: string[];
  /**
   * Arbitrary host directories mounted read-write into this workspace's
   * container. Unlike references, these are raw absolute paths — not
   * workspace IDs.
   */
  mounts?: string[];
  /**
   * Additional roots attached to this workspace. Each root is a host
   * directory exposed to the explorer + editor IPC alongside the primary
   * workspace path. See {@link WorkspaceRoot}.
   */
  roots?: WorkspaceRoot[];
}

// ── Sessions ───────────────────────────────────────────────────

/** Session info surfaced to the renderer. Mirrors Pi SDK's SessionInfo. */
export interface SeroSessionInfo {
  path: string;
  id: string;
  /** Working directory where the session was started. */
  cwd: string;
  /** Workspace this session is bound to. */
  workspaceId: string;
  /** User-defined display name (from /name command). */
  name?: string;
  created: string; // ISO string (Date doesn't survive IPC)
  modified: string; // ISO string
  messageCount: number;
  firstMessage: string;
}

// ── Context Editor ─────────────────────────────────────────────
// Contracts live in @sero-ai/common so app modules (e.g. the Orchestrator loop
// context override) can reuse them. Re-exported here for existing renderer imports.

export type {
  ContextToolInfo,
  ContextSkillInfo,
  SessionContext,
  ContextOverrides,
  ContextPreset,
} from '@sero-ai/common';

// ── Chat turn undo ─────────────────────────────────────────────

export type { ChatComposerPrefill, ChatTurnUndoRef } from './turn-undo';

// ── Agent (extracted to agent.ts) ──────────────────────────────

export type {
  ChatMessage,
  ChatAttachment,
  ToolResultImage,
  ChatUserMessage,
  ChatAssistantMessage,
  ChatToolCallMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
} from './agent';

// ── Container ──────────────────────────────────────────────────

// Re-export the canonical container type from the container subsystem.
// This avoids duplicating the shape and ensures IPC data stays in sync.
export type { ContainerState as ContainerInfo } from '@electron/features/container/core/types';

export interface TerminalCreateResult {
  runtime: 'container' | 'host';
  fallbackReason?: string;
}

// ── Dev Servers ────────────────────────────────────────────────

export type DevServerScope = 'workspace' | 'card-preview';

/** A dev server registered by the agent and managed by the host. */
export interface DevServer {
  /** Unique key: `${workspaceId}:${scope}:${cardId ?? "root"}:${port}`. */
  id: string;
  /** Workspace this server belongs to. */
  workspaceId: string;
  /** Human-readable name (e.g. "Vite Dev Server"). */
  name: string;
  /** Port the server is listening on inside the container. */
  port: number;
  /** Host-accessible URL (via container IP). */
  url: string;
  /** Framework hint (e.g. "vite", "next", "express"). */
  framework?: string;
  /** The command used to start the server (for restart). */
  command: string;
  /** Working directory inside the container where the command should run. */
  cwd: string;
  /** Whether this is the main workspace server or a review preview. */
  scope: DevServerScope;
  /** Card owner for review previews. */
  cardId?: string;
  /** Server status derived from port scanner liveness checks. */
  status: 'running' | 'stopped' | 'starting' | 'failed';
  /** ISO timestamp when the server was registered. */
  registeredAt: string;
}

/**
 * Events pushed from main → renderer when dev server state changes.
 */
export type DevServerEvent =
  | { type: 'registered'; server: DevServer }
  | { type: 'unregistered'; serverId: string }
  | { type: 'status_changed'; serverId: string; status: DevServer['status'] }
  | { type: 'sync'; servers: DevServer[] };

// ── Model Info & Usage Stats (extracted to agent.ts) ───────────

export type {
  ModelInfo,
  SessionModelState,
  AvailableModelGroup,
  SessionUsageStats,
  ContextUsageInfo,
  CompactResult,
} from './agent';

// ── Local Models ─────────────────────────────────────────────────

export type {
  LocalModelApi,
  LocalModelCost,
  LocalModelCompat,
  LocalModelEntry,
  LocalModelOverride,
  LocalProviderConfig,
  LocalModelsConfig,
  LocalModelsSaveResult,
  LocalModelsConnectionRequest,
  LocalRemoteModelInfo,
  LocalProviderPreset,
  LocalProviderPresetConfig,
} from './local-models';

// ── Sero Apps ──────────────────────────────────────────────────

export type {
  SettingsPackageSource,
  SeroAppManifest,
  SeroExplorerViewManifest,
  SeroSearchManifest,
  SeroTitleBarManifest,
  SeroWidgetManifest,
} from './sero-apps';

// ── Plugins ─────────────────────────────────────────────────

export type {
  InstalledPlugin,
  PluginCategory,
  PluginMeta,
  PluginChangeEvent,
  DiscoveredPlugin,
  PluginDevSessionStatus,
  PluginDevSessionUiMode,
  PluginDevSessionIPC,
} from './plugins';

// ── Voice Transcription ──────────────────────────────────────

export type { VoiceTranscriptionStatus, VoiceTranscriptionResult } from './voice';

// ── OAuth / Auth ───────────────────────────────────────────────

/** OAuth provider info surfaced to the renderer for the login dialog. */
export interface OAuthProviderInfo {
  id: string;
  name: string;
  isLoggedIn: boolean;
}

/** API-key provider info for the login dialog. */
export interface ApiKeyProviderInfo {
  id: string;
  name: string;
  /** Whether an API key is configured (auth.json or env var). */
  hasKey: boolean;
  /** True if the key comes from an environment variable (not editable via UI). */
  fromEnv: boolean;
}

/** Combined response from getProviders — both OAuth and API-key providers. */
export interface AuthProvidersResponse {
  oauth: OAuthProviderInfo[];
  apiKey: ApiKeyProviderInfo[];
}

// ── Model Tiers & Onboarding ────────────────────────────────

export type {
  ModelTier,
  ModelTierEntry,
  ModelTierSettings,
  GlobalModelConfigInput,
  GlobalModelConfigState,
} from './model-tiers';

export type {
  ProviderHealthStatus,
  ProviderHealthInfo,
  OnboardingStatePhase,
  OnboardingTierSource,
  OnboardingRecommendation,
  OnboardingWarning,
  OnboardingContainerRuntimeStatus,
  OnboardingContainerRuntime,
  OnboardingState,
} from './onboarding';

export type OAuthEvent =
  | { type: 'auth'; url: string; instructions?: string }
  | { type: 'prompt'; message: string; placeholder?: string }
  | { type: 'select'; message: string; options: Array<{ id: string; label: string }> }
  | { type: 'manual_input'; prompt: string }
  | { type: 'waiting'; message: string }
  | { type: 'progress'; message: string }
  | { type: 'success'; provider: string; message: string }
  | { type: 'error'; provider: string; message: string }
  | { type: 'cancelled' };

export type {
  ResponseFeedbackEntry,
  ResponseFeedbackState,
  UserFeedbackQuestionOption,
  UserFeedbackQuestionItem,
  UserFeedbackPendingQuestion,
  UserFeedbackAnswer,
  UserFeedbackResponse,
} from './user-feedback';

/** Request payload for sero:net:fetch (main-process HTTP proxy). */
export interface ProxyFetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Response payload from sero:net:fetch. */
export interface ProxyFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

// ── Subagent Orchestration ─────────────────────────────────────

// Extracted to keep ipc.ts under 500 LOC.
export type {
  SubagentAgentSummary,
  SubagentStatus,
  SubagentMode,
  SubagentUsage,
  SubagentEntry,
  SubagentToolActivity,
  SubagentAgentFile,
  SubagentEvent,
} from './subagent';

// ── Collaboration Framework ────────────────────────────────────

export type {
  CollaborationRole,
  CollaborationStatus,
  CollaborationSpecialistOutput,
  CollaborationResult,
  CollaborationStateSnapshot,
  CollaborationEvent,
} from './collaboration';

export type { SkillSource, SkillSummary, AvailableSkillSummary, SkillFileData } from './skills';
export type { PromptTemplateSummary, PromptTemplateFileData } from './prompts';

// ── GitHub Repo Creation ────────────────────────────────────────

/** Input parameters for creating a GitHub repository. */
export interface CreateGitHubRepoInput {
  /** Repository name (required). */
  name: string;
  /** Optional description for the repository. */
  description?: string;
  /** Visibility: 'public' or 'private'. Defaults to 'private'. */
  visibility: 'public' | 'private';
  /** Whether to add the new repo as the 'origin' remote. Defaults to true. */
  addRemote?: boolean;
}

/** Result from creating a GitHub repository. */
export interface CreateGitHubRepoResult {
  success: boolean;
  message: string;
  /** The HTTPS URL of the created repo (on success). */
  url?: string;
}

// ── Gateway ─────────────────────────────────────────────────────

export type { QrLoginData } from './gateway';

// ── IPC Channels ───────────────────────────────────────────────

// Extracted to keep ipc.ts under 500 LOC.
// ── App Control (extracted to app-control.ts) ─────────────────
export type {
  AppControlEntry,
  AppElementRect,
  AppElementInfo,
  AppScrollInfo,
  AppAccessibilitySnapshot,
  AppInspectionResult,
  AppInteractionResult,
  AppInteractionParams,
  AppFullScreenshotTarget,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
} from './app-control';

// ── Environment Doctor ─────────────────────────────────────────

export type {
  DoctorCategory,
  DoctorEnvAudit,
  DoctorFix,
  DoctorMode,
  DoctorProgressEvent,
  DoctorRepairResponse,
  DoctorReport,
  DoctorResult,
  DoctorRunArgs,
  DoctorStatus,
} from './doctor';

// ── Auto-update ────────────────────────────────────────────────

export type { UpdaterStatusEvent } from './updater';
