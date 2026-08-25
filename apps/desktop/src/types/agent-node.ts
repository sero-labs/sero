export type AgentNodeConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'unreachable'
  | 'restarted'
  | 'revoked'
  | 'version-skew';

export interface AgentNodeWorkspace {
  id: string;
  name: string;
}

export interface AgentNodeSession {
  id: string;
  workspaceId: string;
  name?: string;
  firstMessage?: string;
  modified: string;
  engine: string;
  model: string;
  taskId?: string;
}

export interface AgentNodeInfo {
  id: string;
  name: string;
  address: string;
  fingerprint: string;
  connectionState: AgentNodeConnectionState;
  lastSeen?: string;
  tools: string[];
  workspaces: AgentNodeWorkspace[];
}

export interface AgentNodeMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface AgentNodeProvider {
  id: string;
  name: string;
  status: string;
}

export interface AgentNodeController {
  id: string;
  name: string;
  createdAt: string;
}

export type AgentNodeEvent =
  | { type: 'nodes-changed'; nodes: AgentNodeInfo[] }
  | { type: 'sessions-changed'; nodeId: string; sessions: AgentNodeSession[] }
  | { type: 'messages-changed'; nodeId: string; sessionId: string; messages: AgentNodeMessage[] };

export interface SeroAgentNodeAPI {
  listNodes(): Promise<AgentNodeInfo[]>;
  enrolNode(input: { address: string; code: string; fingerprint: string }): Promise<AgentNodeInfo>;
  removeNode(nodeId: string): Promise<void>;
  listSessions(nodeId: string): Promise<AgentNodeSession[]>;
  createSession(nodeId: string, input: { workspaceId: string; model: string }): Promise<AgentNodeSession>;
  deleteSession(nodeId: string, sessionId: string): Promise<void>;
  sendMessage(nodeId: string, sessionId: string, text: string): Promise<void>;
  cancelTask(nodeId: string, taskId: string): Promise<void>;
  getProviders(nodeId: string): Promise<AgentNodeProvider[]>;
  login(nodeId: string, providerId: string): Promise<void>;
  logout(nodeId: string, providerId: string): Promise<void>;
  setApiKey(nodeId: string, providerId: string, apiKey: string): Promise<void>;
  removeApiKey(nodeId: string, providerId: string): Promise<void>;
  setSessionModel(nodeId: string, sessionId: string, model: string): Promise<void>;
  listControllers(nodeId: string): Promise<AgentNodeController[]>;
  mintEnrolmentCode(nodeId: string): Promise<{ code: string; fingerprint: string; expiresAt: string }>;
  revokeController(nodeId: string, controllerId: string): Promise<void>;
  retryNode(nodeId: string): Promise<void>;
  subscribe(listener: (event: AgentNodeEvent) => void): () => void;
}
