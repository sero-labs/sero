import type { AuthEvent } from '@sero-ai/a2a';
import type { AgentStreamEvent, ChatMessage } from './agent';
import type { ThinkingLevel } from '@sero-ai/common';
import type { AgentNodeApproval } from './ipc-agent-node';

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
  thinkingLevel: ThinkingLevel;
  approvalMode: 'ask' | 'allow';
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

export type AgentNodeMessage = ChatMessage;

export interface AgentNodeProvider {
  id: string;
  name: string;
  status: string;
}

export interface AgentNodeModel {
  providerId: string;
  api: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels: ThinkingLevel[];
}

export interface AgentNodeController {
  id: string;
  name: string;
  createdAt: string;
}

export type AgentNodeEvent =
  | { type: 'nodes-changed'; nodes: AgentNodeInfo[] }
  | { type: 'sessions-changed'; nodeId: string; sessions: AgentNodeSession[] }
  | { type: 'messages-changed'; nodeId: string; sessionId: string; messages: AgentNodeMessage[] }
  | { type: 'conversation'; nodeId: string; event: AgentStreamEvent }
  | { type: 'artifact'; nodeId: string; sessionKey: string; artifact: import('./ipc-agent-node').AgentNodeArtifact }
  | { type: 'approval'; nodeId: string; sessionKey: string; approval: AgentNodeApproval }
  | { type: 'connection'; nodeId: string; state: AgentNodeConnectionState }
  | { type: 'auth'; nodeId: string; event: AuthEvent };

export interface SeroAgentNodeAPI {
  listNodes(): Promise<AgentNodeInfo[]>;
  enrolNode(input: { name: string; address: string; code: string; fingerprint: string }): Promise<AgentNodeInfo>;
  removeNode(nodeId: string): Promise<void>;
  listSessions(nodeId: string): Promise<AgentNodeSession[]>;
  createSession(nodeId: string, input: { workspaceId: string; model: string }): Promise<AgentNodeSession>;
  deleteSession(nodeId: string, sessionId: string): Promise<void>;
  sendMessage(nodeId: string, sessionId: string, text: string): Promise<{ taskId: string }>;
  respondApproval(nodeId: string, sessionId: string, taskId: string, approvalId: string, approved: boolean, scope?: 'once' | 'task' | 'session'): Promise<{ taskId: string }>;
  setSessionApprovalMode(nodeId: string, sessionId: string, approvalMode: 'ask' | 'allow'): Promise<AgentNodeSession>;
  attachSession(nodeId: string, sessionId: string, taskId?: string): Promise<{ messages: ChatMessage[] }>;
  cancelTask(nodeId: string, taskId: string): Promise<void>;
  readArtifact(nodeId: string, blobId: string): Promise<Uint8Array>;
  getProviders(nodeId: string): Promise<AgentNodeProvider[]>;
  getModels(nodeId: string): Promise<AgentNodeModel[]>;
  login(nodeId: string, providerId: string): Promise<void>;
  logout(nodeId: string, providerId: string): Promise<void>;
  setApiKey(nodeId: string, providerId: string, apiKey: string): Promise<void>;
  removeApiKey(nodeId: string, providerId: string): Promise<void>;
  respondPrompt(nodeId: string, value: string): Promise<void>;
  respondSelect(nodeId: string, value: string): Promise<void>;
  respondManualCode(nodeId: string, value: string): Promise<void>;
  cancelLogin(nodeId: string): Promise<void>;
  setSessionModel(nodeId: string, sessionId: string, model: string): Promise<void>;
  setSessionThinkingLevel(nodeId: string, sessionId: string, thinkingLevel: ThinkingLevel): Promise<void>;
  listControllers(nodeId: string): Promise<AgentNodeController[]>;
  mintEnrolmentCode(nodeId: string): Promise<{ code: string; fingerprint: string; expiresAt: string }>;
  revokeController(nodeId: string, controllerId: string): Promise<void>;
  retryNode(nodeId: string): Promise<void>;
  subscribe(listener: (event: AgentNodeEvent) => void): () => void;
}
