/** Types for the `window.sero` API exposed by the preload script. */

import type {
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  ChatAttachment,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SeroAppManifest,
  SessionUsageStats,
  SessionModelState,
  AuthProvidersResponse,
  OAuthEvent,
  ContainerInfo,
} from './ipc';

interface SeroWorkspaceAPI {
  /** List all registered workspaces (registry + config merged). */
  list(): Promise<WorkspaceInfo[]>;
  /** Create a new workspace under ~/.sero-ui/workspaces/. */
  create(name: string): Promise<WorkspaceInfo>;
  /** Unregister a workspace (does not delete files). */
  remove(id: string): Promise<void>;
  /** Get full config for a workspace (.sero-workspace.json). */
  getConfig(id: string): Promise<WorkspaceConfig | null>;
  /** Register an existing folder as a workspace. Creates config if missing. */
  addFolder(folderPath: string, name?: string): Promise<WorkspaceInfo>;
  /** Open workspace in sidebar (persisted). */
  open(id: string): Promise<void>;
  /** Close workspace in sidebar (persisted). */
  close(id: string): Promise<void>;
  /** Open native folder picker. Returns selected path or null. */
  pickFolder(): Promise<string | null>;
  /** Infer best workspace for a message. Returns workspace ID. */
  infer(message: string): Promise<string>;
  /** Enable or disable container mode for a workspace. */
  setContainer(id: string, enabled: boolean): Promise<void>;
}

interface SeroSessionsAPI {
  /** List sessions. Optionally filter by workspace ID. */
  list(workspaceId?: string): Promise<SeroSessionInfo[]>;
  /** Create a session bound to a workspace. Defaults to scratchpad. */
  create(workspaceId?: string): Promise<SeroSessionInfo>;
  delete(sessionPath: string): Promise<void>;
}

interface SeroAgentAPI {
  /** Open a session in the agent pool. Creates a workspace-scoped AgentSession. */
  open(sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]>;
  /** Send a prompt to a specific session, optionally with file attachments. */
  prompt(sessionId: string, text: string, attachments?: ChatAttachment[]): Promise<void>;
  /** Abort a specific session's current operation. */
  abort(sessionId: string): Promise<void>;
  /** Close a specific session and dispose its AgentSession. */
  close(sessionId: string): Promise<void>;
  /** Get available slash commands for a session. */
  getCommands(sessionId: string): Promise<SeroSlashCommandInfo[]>;
  /** Reload resources (skills, prompts, extensions). Returns updated commands. */
  reloadResources(sessionId: string): Promise<SeroSlashCommandInfo[]>;
  /** Get usage stats (tokens + cost) for a session. */
  getUsage(sessionId: string): Promise<SessionUsageStats | null>;
  /** Get current model + thinking level state. */
  getModelState(sessionId: string): Promise<SessionModelState | null>;
  /** Set the model for a session. */
  setModel(sessionId: string, provider: string, modelId: string): Promise<SessionModelState>;
  /** Set thinking/reasoning level for a session. */
  setThinkingLevel(sessionId: string, level: string): Promise<SessionModelState>;
  /** Subscribe to streaming events pushed from main process. Returns unsubscribe. */
  onEvent(callback: (event: AgentStreamEvent) => void): () => void;
}

interface SeroShellAPI {
  /** Reveal a file or folder in the native file explorer. */
  showItemInFolder(fullPath: string): Promise<void>;
}

interface SeroAppStateAPI {
  /** Read an app state JSON file. */
  read(filePath: string): Promise<unknown>;
  /** Write an app state JSON file (atomic + serialised). */
  write(filePath: string, data: unknown): Promise<void>;
  /** Start watching a state file. Returns current state. */
  watch(filePath: string): Promise<unknown>;
  /** Stop watching a state file. */
  unwatch(filePath: string): Promise<void>;
  /** Subscribe to state file change events. Returns unsubscribe. */
  onChange(callback: (filePath: string, data: unknown) => void): () => void;
}

interface SeroAppsAPI {
  /** Discover all registered Sero apps from installed Pi packages. */
  discover(): Promise<SeroAppManifest[]>;
}

interface SeroAppAgentAPI {
  /**
   * Send a prompt to an app's dedicated agent session.
   * Returns the full text response. No active chat session required.
   */
  prompt(appId: string, workspaceId: string, text: string): Promise<string>;
}

interface SeroAuthAPI {
  /** Get all providers (OAuth + API key) with auth status. */
  getProviders(): Promise<AuthProvidersResponse>;
  /** Start OAuth login for a provider. Resolves when flow completes. */
  login(providerId: string): Promise<void>;
  /** Logout from a provider (OAuth or API key). */
  logout(providerId: string): Promise<void>;
  /** Save an API key for a provider. */
  setApiKey(providerId: string, key: string): Promise<void>;
  /** Remove a saved API key for a provider. */
  removeApiKey(providerId: string): Promise<void>;
  /** Respond to a pending prompt during login. */
  respondPrompt(value: string): Promise<void>;
  /** Respond to a pending manual code input during login. */
  respondManualCode(value: string): Promise<void>;
  /** Cancel in-progress login. */
  cancel(): Promise<void>;
  /** Subscribe to OAuth flow events. Returns unsubscribe. */
  onEvent(callback: (event: OAuthEvent) => void): () => void;
}

interface SeroContainerAPI {
  /** Get container state for a workspace. Returns null if no container. */
  status(workspaceId: string): Promise<ContainerInfo | null>;
  /** Detailed container inspection. */
  inspect(workspaceId: string): Promise<ContainerInfo>;
}

interface SeroTerminalAPI {
  /** Create a terminal session in a workspace container. */
  create(workspaceId: string, terminalId: string, cols?: number, rows?: number): Promise<void>;
  /** Send input data to a terminal. */
  write(terminalId: string, data: string): Promise<void>;
  /** Resize a terminal. */
  resize(terminalId: string, cols: number, rows: number): Promise<void>;
  /** Close a terminal session. */
  dispose(terminalId: string): Promise<void>;
  /** Get buffered output for replay when xterm.js remounts. */
  replay(terminalId: string): Promise<string>;
  /** Subscribe to terminal output data. Returns unsubscribe. */
  onData(callback: (terminalId: string, data: string) => void): () => void;
  /** Subscribe to terminal exit events. Returns unsubscribe. */
  onExit(callback: (terminalId: string) => void): () => void;
}

interface SeroFiletreeAPI {
  /** Start watching a workspace directory for changes. */
  watch(workspaceId: string): Promise<void>;
  /** Stop watching a workspace directory. */
  unwatch(workspaceId: string): Promise<void>;
  /** Set the active workspace (only active workspace watcher runs). */
  setActive(workspaceId: string | null): Promise<void>;
  /** Subscribe to file change events. Returns unsubscribe. */
  onChanged(callback: (data: { workspaceId: string; directories: string[] }) => void): () => void;
}

interface SeroAPI {
  platform: string;
  shell: SeroShellAPI;
  workspace: SeroWorkspaceAPI;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
  appState: SeroAppStateAPI;
  apps: SeroAppsAPI;
  appAgent: SeroAppAgentAPI;
  auth: SeroAuthAPI;
  container: SeroContainerAPI;
  terminal: SeroTerminalAPI;
  filetree: SeroFiletreeAPI;
}

declare global {
  interface Window {
    sero: SeroAPI;
  }
}

export {};
