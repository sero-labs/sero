/** Types for the `window.sero` API exposed by the preload script. */

import type {
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SeroAppManifest,
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
  /** Send a prompt to a specific session. */
  prompt(sessionId: string, text: string): Promise<void>;
  /** Abort a specific session's current operation. */
  abort(sessionId: string): Promise<void>;
  /** Close a specific session and dispose its AgentSession. */
  close(sessionId: string): Promise<void>;
  /** Get available slash commands for a session. */
  getCommands(sessionId: string): Promise<SeroSlashCommandInfo[]>;
  /** Reload resources (skills, prompts, extensions). Returns updated commands. */
  reloadResources(sessionId: string): Promise<SeroSlashCommandInfo[]>;
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

interface SeroAPI {
  platform: string;
  shell: SeroShellAPI;
  workspace: SeroWorkspaceAPI;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
  appState: SeroAppStateAPI;
  apps: SeroAppsAPI;
}

declare global {
  interface Window {
    sero: SeroAPI;
  }
}

export {};
