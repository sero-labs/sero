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

// ── Slash Commands ─────────────────────────────────────────────

/** Slash command info from PI SDK. Mirrors SlashCommandInfo from pi-coding-agent. */
export interface SeroSlashCommandInfo {
  name: string;
  description?: string;
  source: 'extension' | 'prompt' | 'skill';
  location?: 'user' | 'project' | 'path';
  path?: string;
}

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
}

export interface ChatToolCallMessage {
  type: 'tool';
  id: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string | null;
  isError: boolean;
  state: 'pending' | 'running' | 'completed' | 'error';
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
  | { type: 'message_start'; sessionId: string; message: ChatMessage }
  | { type: 'message_end'; sessionId: string; messageId: string; text: string }
  | { type: 'tool_start'; sessionId: string; tool: ChatToolCallMessage }
  | { type: 'tool_end'; sessionId: string; toolCallId: string; output: string | null; isError: boolean }
  | { type: 'session_name'; sessionId: string; name: string }
  | { type: 'model_change'; sessionId: string; state: SessionModelState }
  | { type: 'error'; sessionId: string; error: string }
  | { type: 'container_starting'; sessionId: string; workspaceId: string }
  | { type: 'container_ready'; sessionId: string; workspaceId: string; ipAddress?: string }
  | { type: 'container_error'; sessionId: string; workspaceId: string; error: string };

// ── Container ──────────────────────────────────────────────────

/** Container state surfaced to the renderer. */
export interface ContainerInfo {
  id: string;
  image: string;
  state: 'running' | 'stopped' | 'unknown';
  ipAddress?: string;
  cpus: number;
  memoryBytes: number;
}

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
  /** Lucide icon name (e.g. "check-square"). */
  icon: string;
  /** State file path relative to workspace root. */
  stateFile: string;
  /** Path to the module federation remoteEntry.js. Null if no UI. */
  uiEntry: string | null;
  /** Exported component name from the remote (e.g. "TodoApp"). */
  component: string | null;
  /** Absolute path to the package root on disk. */
  packagePath: string;
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

// ── IPC Channels ───────────────────────────────────────────────

/** IPC channel constants — single source of truth. */
export const IpcChannels = {
  workspace: {
    list: 'sero:workspace:list',
    create: 'sero:workspace:create',
    remove: 'sero:workspace:remove',
    getConfig: 'sero:workspace:get-config',
    addFolder: 'sero:workspace:add-folder',
    /** Open workspace in sidebar (persisted). */
    open: 'sero:workspace:open',
    /** Close workspace in sidebar (persisted). */
    close: 'sero:workspace:close',
    /** Open native folder picker dialog. Returns path or null. */
    pickFolder: 'sero:workspace:pick-folder',
    /** Infer best workspace for a given message. Returns workspace ID. */
    infer: 'sero:workspace:infer',
    /** Toggle container mode for a workspace. Args: id, enabled. */
    setContainer: 'sero:workspace:set-container',
  },
  sessions: {
    list: 'sero:sessions:list',
    create: 'sero:sessions:create',
    delete: 'sero:sessions:delete',
  },
  agent: {
    open: 'sero:agent:open',
    prompt: 'sero:agent:prompt',
    abort: 'sero:agent:abort',
    close: 'sero:agent:close',
    /** Get available slash commands for a session. */
    getCommands: 'sero:agent:get-commands',
    /** Reload resources (skills, prompts, extensions) for a session. Returns updated commands. */
    reloadResources: 'sero:agent:reload-resources',
    /** Get usage stats for a session. */
    getUsage: 'sero:agent:get-usage',
    /** Get current model + thinking state for a session. */
    getModelState: 'sero:agent:get-model-state',
    /** Set model for a session. Args: sessionId, provider, modelId. */
    setModel: 'sero:agent:set-model',
    /** Set thinking level for a session. Args: sessionId, level. */
    setThinkingLevel: 'sero:agent:set-thinking-level',
    /** Main → renderer push channel for streaming events. */
    event: 'sero:agent:event',
  },
  shell: {
    /** Open a path in the native file explorer. */
    showItemInFolder: 'sero:shell:show-item-in-folder',
  },
  appState: {
    /** Read an app state JSON file. */
    read: 'sero:app-state:read',
    /** Write an app state JSON file (atomic). */
    write: 'sero:app-state:write',
    /** Start watching a state file. Returns current state. */
    watch: 'sero:app-state:watch',
    /** Stop watching a state file. */
    unwatch: 'sero:app-state:unwatch',
    /** Main → renderer: state file changed. */
    change: 'sero:app-state:change',
  },
  apps: {
    /** Discover all registered Sero apps. */
    discover: 'sero:apps:discover',
  },
  appAgent: {
    /** Send a prompt to an app's dedicated agent session. Returns text response. */
    prompt: 'sero:app-agent:prompt',
  },
  auth: {
    /** Get all providers (OAuth + API key) with auth status. */
    getProviders: 'sero:auth:get-providers',
    /** Start OAuth login for a provider. */
    login: 'sero:auth:login',
    /** Logout from a provider (OAuth or API key). */
    logout: 'sero:auth:logout',
    /** Save an API key for a provider. */
    setApiKey: 'sero:auth:set-api-key',
    /** Remove an API key for a provider. */
    removeApiKey: 'sero:auth:remove-api-key',
    /** Respond to a pending prompt during login. */
    respondPrompt: 'sero:auth:respond-prompt',
    /** Respond to a pending manual code input during login. */
    respondManualCode: 'sero:auth:respond-manual-code',
    /** Cancel in-progress login. */
    cancel: 'sero:auth:cancel',
    /** Main → renderer push channel for OAuth flow events. */
    event: 'sero:auth:event',
  },
  container: {
    /** Get container state for a workspace. Returns ContainerInfo | null. */
    status: 'sero:container:status',
    /** Detailed container inspection. */
    inspect: 'sero:container:inspect',
  },
  terminal: {
    /** Create a terminal session in a workspace container. */
    create: 'sero:terminal:create',
    /** Send input data to a terminal. */
    write: 'sero:terminal:write',
    /** Resize a terminal. */
    resize: 'sero:terminal:resize',
    /** Close a terminal session. */
    dispose: 'sero:terminal:dispose',
    /** Get buffered output for replay when xterm.js remounts. */
    replay: 'sero:terminal:replay',
    /** Main → renderer push: terminal output data. */
    data: 'sero:terminal:data',
    /** Main → renderer push: terminal process exited. */
    exit: 'sero:terminal:exit',
  },
  filetree: {
    /** Start watching a workspace directory for changes. */
    watch: 'sero:filetree:watch',
    /** Stop watching a workspace directory. */
    unwatch: 'sero:filetree:unwatch',
    /** Set the active workspace (only active workspace watcher runs). */
    setActive: 'sero:filetree:set-active',
    /** Main → renderer push: directories changed. */
    changed: 'sero:filetree:changed',
  },
} as const;
