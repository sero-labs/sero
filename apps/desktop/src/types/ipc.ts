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
}

/** Full workspace config from .sero-workspace.json at workspace root. */
export interface WorkspaceConfig {
  id: string;
  name: string;
  description?: string;
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

export interface ChatUserMessage {
  type: 'user';
  id: string;
  text: string;
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
  | { type: 'error'; sessionId: string; error: string };

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
} as const;
