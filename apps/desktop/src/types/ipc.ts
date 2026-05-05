/**
 * Shared IPC type definitions.
 *
 * Imported by both Electron main process and renderer.
 * Each domain gets a channel prefix and typed payloads.
 */

// ── Profiles ───────────────────────────────────────────────────

export type { ProfileInfo } from './profile';

// ── Workspaces ─────────────────────────────────────────────────

export type {
  WorkspaceRuntimeProviderId,
  WorkspaceRuntimePolicyHistoryEntry,
  WorkspaceRuntimeConfig,
  OpenShellRemoteGatewayEntry,
  OpenShellRemoteGatewayInput,
  OpenShellRemoteGatewayTestResult,
  OpenShellCloudAuthMode,
  OpenShellCloudGatewayEntry,
  OpenShellCloudGatewayInput,
  OpenShellCloudGatewayTestResult,
  WorkspaceRegistryEntry,
  WorkspaceRoot,
  WorkspaceInfo,
  EditorRoot,
  WorkspaceConfig,
} from './workspace';

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

/** Tool info for the context editor (renderer-safe, no execute function). */
export interface ContextToolInfo {
  name: string;
  label?: string;
  description?: string;
}

/** Skill info for the context editor. */
export interface ContextSkillInfo {
  name: string;
  description?: string;
  filePath?: string;
}

/** Full session context returned by getSessionContext. */
export interface SessionContext {
  /** Base system prompt before any per-session overrides are applied. */
  systemPrompt: string;
  /** Full tool list available to the session before per-session filtering. */
  tools: ContextToolInfo[];
  /** Full skill list available to the session. */
  skills: ContextSkillInfo[];
  /** Currently applied per-session overrides, if any. */
  overrides: ContextOverrides | null;
}

/** Context overrides sent to the main process. */
export interface ContextOverrides {
  /** If set, replaces the default system prompt entirely. */
  systemPrompt?: string | null;
  /** Tool names to disable (removed from the tool list). */
  disabledTools?: string[];
  /** Skill names to disable (stripped from system prompt). */
  disabledSkills?: string[];
}

/** A saved context editor preset (persisted to disk via IPC). */
export interface ContextPreset {
  id: string;
  name: string;
  /** If null, use the default system prompt. If string, override with this. */
  systemPrompt: string | null;
  /** Tool names to disable. */
  disabledTools: string[];
  /** Skill names to disable. */
  disabledSkills: string[];
}

// ── Slash Commands ─────────────────────────────────────────────

/** Slash command info from PI SDK. Mirrors SlashCommandInfo from pi-coding-agent. */
export interface SeroSlashCommandInfo {
  name: string;
  description?: string;
  source: 'extension' | 'prompt' | 'skill';
  location?: 'user' | 'project' | 'path';
  path?: string;
}

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
  status: 'running' | 'stopped' | 'starting';
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
  LocalModelsConnectionRequest,
  LocalRemoteModelInfo,
  LocalProviderPreset,
  LocalProviderPresetConfig,
} from './local-models';

// ── Sero Apps ──────────────────────────────────────────────────

export type { SettingsPackageSource, SeroAppManifest, SeroWidgetManifest } from './sero-apps';

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

/**
 * Events pushed from main → renderer during an OAuth login flow.
 * The renderer dialog reacts to each event to update its UI state.
 */
export type OAuthEvent =
  | { type: 'auth'; url: string; instructions?: string }
  | { type: 'prompt'; message: string; placeholder?: string }
  | { type: 'manual_input'; prompt: string }
  | { type: 'waiting'; message: string }
  | { type: 'progress'; message: string }
  | { type: 'success'; provider: string; message: string }
  | { type: 'error'; provider: string; message: string }
  | { type: 'cancelled' };

// ── Response + User Feedback ───────────────────────────────────

export type {
  ResponseFeedbackEntry,
  ResponseFeedbackState,
  UserFeedbackQuestionOption,
  UserFeedbackQuestionItem,
  UserFeedbackPendingQuestion,
  UserFeedbackAnswer,
  UserFeedbackResponse,
} from './user-feedback';

// ── Net Proxy ──────────────────────────────────────────────────

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
  AppInspectionResult,
  AppInteractionResult,
  AppInteractionParams,
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
