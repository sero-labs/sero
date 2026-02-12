/** Types for the `window.sero` API exposed by the preload script. */

import type {
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  AgentStreamEvent,
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
  /** Subscribe to streaming events pushed from main process. Returns unsubscribe. */
  onEvent(callback: (event: AgentStreamEvent) => void): () => void;
}

interface SeroAPI {
  platform: string;
  workspace: SeroWorkspaceAPI;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
}

declare global {
  interface Window {
    sero: SeroAPI;
  }
}

export {};
