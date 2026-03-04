/**
 * Shared IPC type definitions.
 *
 * Imported by both Electron main process and renderer.
 * Each domain gets a channel prefix and typed payloads.
 */

// ── Workspaces ─────────────────────────────────────────────────

/** Entry in the workspace registry (~/.sero-ui/agent/workspaces.json). */
export interface WorkspaceRegistryEntry {
  /** Unique ID (kebab-case slug). */
  id: string;
  /** Absolute path to workspace root. */
  path: string;
  /** Whether the workspace is visible in the sidebar. Persisted. */
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
  systemPrompt: string;
  tools: ContextToolInfo[];
  skills: ContextSkillInfo[];
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

// ── Agent ──────────────────────────────────────────────────────

/** Renderer-friendly message types for the ChatPanel. */
export type ChatMessage =
  | ChatUserMessage
  | ChatAssistantMessage
  | ChatToolCallMessage;

/** File attachment metadata for user messages. */
export interface ChatAttachment {
  id: string;
  filename?: string;
  mediaType?: string;
  /** Data URL (base64) or blob URL. */
  url: string;
}

export interface ChatUserMessage {
  type: 'user';
  id: string;
  text: string;
  /** Optional file attachments included with the message. */
  attachments?: ChatAttachment[];
}

export interface ChatAssistantMessage {
  type: 'assistant';
  id: string;
  text: string;
  /** True while this message is still receiving deltas. */
  isStreaming: boolean;
  /** Accumulated thinking/reasoning text (only present when model uses reasoning). */
  thinking?: string;
}

export interface ChatToolCallMessage {
  type: 'tool';
  id: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string | null;
  isError: boolean;
  state: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
}

/**
 * Events pushed from main → renderer during agent streaming.
 * Kept deliberately slim — only what the UI needs to render.
 *
 * Every event carries `sessionId` so the renderer can route events
 * to the correct AgentInstance in a multi-session pool.
 */
export type AgentStreamEvent =
  | { type: 'agent_start'; sessionId: string }
  | { type: 'agent_end'; sessionId: string }
  | { type: 'messages_loaded'; sessionId: string; messages: ChatMessage[] }
  | { type: 'text_delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'thinking_delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'message_start'; sessionId: string; message: ChatMessage }
  | { type: 'message_end'; sessionId: string; messageId: string; text: string; thinking?: string }
  | { type: 'tool_start'; sessionId: string; tool: ChatToolCallMessage }
  | { type: 'tool_end'; sessionId: string; toolCallId: string; output: string | null; isError: boolean }
  | { type: 'user_checkpoint'; sessionId: string; userMessageId: string; checkpoint: ChatCheckpointRef }
  | { type: 'session_name'; sessionId: string; name: string }
  | { type: 'model_change'; sessionId: string; state: SessionModelState }
  | { type: 'error'; sessionId: string; error: string }
  | { type: 'container_starting'; sessionId: string; workspaceId: string }
  | { type: 'container_ready'; sessionId: string; workspaceId: string; ipAddress?: string }
  | { type: 'container_error'; sessionId: string; workspaceId: string; error: string };

// ── Container ──────────────────────────────────────────────────

// Re-export the canonical container type from the container subsystem.
// This avoids duplicating the shape and ensures IPC data stays in sync.
export type { ContainerState as ContainerInfo } from '../../electron/container/types';

// ── Dev Servers ────────────────────────────────────────────────

/** A dev server registered by the agent and managed by the host. */
export interface DevServer {
  /** Unique key: `${workspaceId}:${port}`. */
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

// ── Model Info ─────────────────────────────────────────────────

/** Serialisable model info for the renderer (no class instances). */
export interface ModelInfo {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
}

/** Current model + thinking level for a session. */
export interface SessionModelState {
  model: ModelInfo;
  thinkingLevel: string;
  availableThinkingLevels: string[];
  supportsXhigh: boolean;
  /** All models with auth, grouped by provider display name. */
  availableModels: AvailableModelGroup[];
}

/** A group of models under a single provider, for the model selector. */
export interface AvailableModelGroup {
  provider: string;
  displayName: string;
  /** Logo URL (models.dev SVG). */
  logo: string;
  models: ModelInfo[];
}

// ── Usage Stats ────────────────────────────────────────────────

/** Session usage stats returned by PI SDK's AgentSession.getSessionStats(). */
export interface SessionUsageStats {
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  requestCount: number;
}

// ── Sero Apps ──────────────────────────────────────────────────

/** Manifest for a Sero app discovered from a Pi package. */
export interface SeroAppManifest {
  /** Unique app identifier (e.g. "todo"). */
  id: string;
  /** Display name. */
  name: string;
  /** Package description from package.json. */
  description: string | null;
  /** Package version from package.json. */
  version: string | null;
  /** npm package name from package.json. */
  packageName: string | null;
  /** Lucide icon name (e.g. "check-square"). */
  icon: string;
  /** State file path relative to workspace root (workspace-scoped apps). */
  stateFile: string;
  /**
   * Whether the app's state is per-workspace or shared globally.
   * - `"workspace"` (default): state at `<workspacePath>/<stateFile>`
   * - `"global"`: state at `~/.sero-ui/apps/<appId>/state.json`
   */
  scope: 'global' | 'workspace';
  /**
   * Absolute path to the global state file. Only set when `scope === "global"`.
   * Computed by app-discovery from `SERO_HOME/apps/<appId>/state.json`.
   */
  globalStatePath: string | null;
  /** Path to the module federation remoteEntry.js. Null if no UI. */
  uiEntry: string | null;
  /** Exported component name from the remote (e.g. "TodoApp"). */
  component: string | null;
  /** Dev server port for module federation (from sero.app.devPort). */
  devPort: number | undefined;
  /** Absolute path to the package root on disk. */
  packagePath: string;
}

// ── Voice Transcription ──────────────────────────────────────

/** Voice transcription availability for renderer UI gating. */
export interface VoiceTranscriptionStatus {
  enabled: boolean;
  reason?: string;
}

/** Result returned from the voice transcription endpoint. */
export interface VoiceTranscriptionResult {
  text: string;
  model: string;
}

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

// ── IPC Channels ───────────────────────────────────────────────

// Extracted to keep ipc.ts under 500 LOC.
export { IpcChannels } from './ipc-channels';
