/**
 * Shared IPC type definitions.
 *
 * Imported by both Electron main process and renderer.
 * Each domain gets a channel prefix and typed payloads.
 */

// ── Profiles ───────────────────────────────────────────────────

/**
 * Profile info surfaced to the renderer via IPC.
 *
 * ⚠️  KEEP IN SYNC with the Electron-side duplicate in electron/profile/types.ts.
 *     Both files define the same shape — if you change one, change the other.
 */
export interface ProfileInfo {
  /** Unique identifier. */
  id: string;
  /** User-facing display name (editable, independent of folder name). */
  name: string;
  /** Absolute path to the profile's root directory (= SERO_HOME). */
  path: string;
  /** ISO timestamp of when the profile was created. */
  createdAt: string;
  /** True if this is the currently active profile. */
  isActive: boolean;
  /** True once onboarding has completed for this profile. */
  onboarded?: boolean;
}

// ── Workspaces ─────────────────────────────────────────────────

/** Entry in the workspace registry (~/.sero-ui/agent/workspaces.json). */
export interface WorkspaceRegistryEntry {
  /** Unique ID (kebab-case slug). */
  id: string;
  /** Absolute path to workspace root. */
  path: string;
  /** Whether the workspace tree node is expanded in the sidebar. */
  open: boolean;
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
  /** Whether this workspace runs inside a container. Defaults to true. */
  container: boolean;
  /** IDs of other workspaces mounted into this workspace's container. */
  references: string[];
  /** Arbitrary host folders mounted read-write into this workspace's container. */
  mounts: string[];
}

/** Full workspace config from .sero-workspace.json at workspace root. */
export interface WorkspaceConfig {
  id: string;
  name: string;
  description?: string;
  /** Whether this workspace runs inside a container. Defaults to true. */
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

// ── Checkpoints ────────────────────────────────────────────────

import type { ChatCheckpointRef } from './checkpoints';
export type { ChatCheckpointRef } from './checkpoints';

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
export type { ContainerState as ContainerInfo } from '../../electron/features/container/core/types';

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

export type { InstalledPlugin, PluginCategory, PluginMeta, PluginChangeEvent } from './plugins';

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

// ── Response Feedback ──────────────────────────────────────────

/** A single user feedback entry for an agent response. */
export interface ResponseFeedbackEntry {
  /** The assistant message ID this feedback is for. */
  messageId: string;
  /** Session ID where the response occurred. */
  sessionId: string;
  /** 'good' or 'bad' rating. */
  rating: 'good' | 'bad';
  /** ISO timestamp when feedback was submitted. */
  timestamp: string;
  /** First ~300 chars of the user prompt that preceded this response. */
  promptExcerpt?: string;
  /** First ~300 chars of the assistant response. */
  responseExcerpt?: string;
  /** Optional free-text note from the user. */
  note?: string;
}

/** Full feedback state persisted to disk. */
export interface ResponseFeedbackState {
  entries: ResponseFeedbackEntry[];
}

// ── User Feedback (question / questionnaire tools) ─────────────
//
// Source of truth: packages/pi-user-feedback/shared/types.ts
// These are mirrored here because the electron tsconfig's rootDir constraint
// prevents cross-package imports. When modifying, update BOTH files.

export interface UserFeedbackQuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface UserFeedbackQuestionItem {
  id: string;
  label: string;
  prompt: string;
  options: UserFeedbackQuestionOption[];
  allowOther: boolean;
}

/** Sent from main → renderer when a question/questionnaire/interview/permission tool starts. */
export interface UserFeedbackPendingQuestion {
  id: string;
  type: 'question' | 'questionnaire' | 'interview' | 'permission';
  toolCallId: string;
  questions: UserFeedbackQuestionItem[];
  timestamp: string;
}

export interface UserFeedbackAnswer {
  questionId: string;
  value: string;
  label: string;
  wasCustom: boolean;
  index?: number;
}

/** Sent from renderer → main when the user answers or cancels. */
export interface UserFeedbackResponse {
  id: string;
  answers: UserFeedbackAnswer[];
  cancelled: boolean;
}

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
  AppInteractionResult,
  AppInteractionParams,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
} from './app-control';

export { IpcChannels } from './ipc-channels';
