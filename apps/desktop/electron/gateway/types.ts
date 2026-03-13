/**
 * Gateway shared types — interfaces used across gateway modules.
 *
 * Extracted from gateway/index.ts to keep file sizes under 500 LOC.
 */

export interface GatewayConfig {
  /** Port for the WebSocket server. Default: 18800. */
  port: number;
  /** Bind host. Default: '127.0.0.1' (localhost only). */
  host: string;
  /** Path to the auth token file. */
  tokenPath: string;
  /** Directory for gateway config files (cost limits, etc.). */
  configDir: string;
}

/** File entry returned by listFiles. */
export interface GatewayFileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size: number;
}

/** File content returned by readFile. */
export interface GatewayFileContent {
  content: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  size: number;
}

/** Operations the gateway can delegate to the agent pool. */
export interface GatewayAgentOps {
  /** Open or get an existing agent session. Returns session path. */
  openSession(
    sessionId: string,
    workspaceId: string,
  ): Promise<void>;
  /** Send a prompt to an agent session. */
  prompt(
    sessionId: string,
    text: string,
    images?: Array<{ data: string; mimeType: string }>,
  ): Promise<void>;
  /** Steer an active agent. */
  steer(sessionId: string, text: string): Promise<void>;
  /** Abort an active agent. */
  abort(sessionId: string): Promise<void>;
  /** List workspaces. */
  listWorkspaces(): Promise<Array<{ id: string; name: string; path: string }>>;
  /** List sessions for a workspace. */
  listSessions(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string; firstMessage?: string }>>;
  /** Create a new session for a workspace. */
  createSession(workspaceId: string, name?: string): Promise<{ id: string; name: string }>;
  /** List files in a workspace directory. */
  listFiles(workspaceId: string, dirPath: string): Promise<GatewayFileEntry[]>;
  /** Read a file from a workspace. */
  readFile(workspaceId: string, filePath: string): Promise<GatewayFileContent>;
  /** List artifacts for a session. */
  listArtifacts(sessionId: string): Promise<Array<{ id: string; type: string; title: string; timestamp: string; mimeType: string }>>;
  /** Get artifact data by ID. */
  getArtifact(artifactId: string): Promise<{ base64: string; mimeType: string; title: string } | null>;
  /** Get message history for a session. */
  getSessionHistory(
    workspaceId: string,
    sessionId: string,
  ): Promise<Array<{
    id: string;
    type: 'user' | 'assistant' | 'system';
    text: string;
    thinking?: string;
    images?: Array<{ base64: string; mimeType: string }>;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      state: 'done' | 'error';
      output?: string;
    }>;
    timestamp: number;
  }>>;
}
