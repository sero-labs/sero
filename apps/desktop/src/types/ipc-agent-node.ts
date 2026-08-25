import type { AgentStreamEvent, ChatAttachment, ChatMessage } from './agent';

export const AGENT_NODE_CONTROL_OPERATIONS = [
  'enrol',
  'mintEnrolmentCode',
  'listControllers',
  'revokeController',
  'listSessions',
  'createSession',
  'deleteSession',
  'setSessionModel',
  'getNodeHealth',
  'getProviders',
  'login',
  'logout',
  'setApiKey',
  'removeApiKey',
  'respondPrompt',
  'respondSelect',
  'respondManualCode',
  'cancel',
] as const;

export type AgentNodeControlOperation = typeof AGENT_NODE_CONTROL_OPERATIONS[number];

export type AgentNodeConnectionState =
  | 'disconnected'
  | 'connected'
  | 'reconnecting'
  | 'unreachable'
  | 'revoked'
  | 'version-skew';

/** Renderer-safe node metadata. Bearer credentials are deliberately absent. */
export interface AgentNodeInfo {
  id: string;
  name: string;
  address: string;
  fingerprint: string;
  tools: string[];
  state: AgentNodeConnectionState;
  lastSeenAt: string | null;
}

export interface AgentNodeEnrolInput {
  name: string;
  address: string;
  code: string;
  fingerprint: string;
}

export interface AgentNodeSession {
  contextId: string;
  name: string;
  workspace: string;
  model: { providerId: string; modelId: string };
  updatedAt: string;
  runningTaskId: string | null;
}

export interface AgentNodeController {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AgentNodeHealth {
  status: 'healthy' | 'degraded';
  nodeId: string;
  nodeName: string;
  version: string;
  startedAt: string;
}

type EmptyRequest = Record<string, never>;
type ProviderRequest = { providerId: string };
type ResponseRequest = { value: string };
type OkResponse = { ok: true };

export interface AgentNodeControlRequestMap {
  enrol: { code: string; controllerName: string };
  mintEnrolmentCode: EmptyRequest;
  listControllers: EmptyRequest;
  revokeController: { controllerId: string };
  listSessions: EmptyRequest;
  createSession: { workspace: string; model: AgentNodeSession['model']; name?: string };
  deleteSession: { contextId: string };
  setSessionModel: { contextId: string; model: AgentNodeSession['model'] };
  getNodeHealth: EmptyRequest;
  getProviders: EmptyRequest;
  login: ProviderRequest;
  logout: ProviderRequest;
  setApiKey: ProviderRequest & { key: string };
  removeApiKey: ProviderRequest;
  respondPrompt: ResponseRequest;
  respondSelect: ResponseRequest;
  respondManualCode: ResponseRequest;
  cancel: EmptyRequest;
}

export interface AgentNodeControlResponseMap {
  enrol: { controllerId: string; token: string };
  mintEnrolmentCode: { code: string; expiresAt: string };
  listControllers: { controllers: AgentNodeController[] };
  revokeController: OkResponse;
  listSessions: { sessions: AgentNodeSession[] };
  createSession: { session: AgentNodeSession };
  deleteSession: OkResponse;
  setSessionModel: { session: AgentNodeSession };
  getNodeHealth: { health: AgentNodeHealth };
  getProviders: {
    oauth: Array<{ id: string; name: string; isLoggedIn: boolean }>;
    apiKey: Array<{ id: string; name: string; hasKey: boolean; fromEnv: boolean }>;
  };
  login: OkResponse;
  logout: OkResponse;
  setApiKey: OkResponse;
  removeApiKey: OkResponse;
  respondPrompt: { accepted: boolean };
  respondSelect: { accepted: boolean };
  respondManualCode: { accepted: boolean };
  cancel: OkResponse;
}

export type AgentNodeRendererControlOperation = Exclude<AgentNodeControlOperation, 'enrol'>;
export type AgentNodeControlArgs = {
  [Name in AgentNodeRendererControlOperation]: {
    operation: Name;
    params: AgentNodeControlRequestMap[Name];
  }
}[AgentNodeRendererControlOperation];

export type AgentNodeControlResponse =
  AgentNodeControlResponseMap[AgentNodeRendererControlOperation];

export interface AgentNodeMessageInput {
  nodeId: string;
  contextId: string;
  text: string;
  attachments?: ChatAttachment[];
  taskId?: string;
  mode?: 'steer' | 'followUp';
}

export type AgentNodeEvent =
  | { type: 'connection'; nodeId: string; state: AgentNodeConnectionState }
  | { type: 'conversation'; nodeId: string; event: AgentStreamEvent }
  | { type: 'node'; nodeId: string; event: unknown }
  | { type: 'auth'; nodeId: string; event: unknown };

export interface AgentNodeAttachResult {
  sessionKey: string;
  messages: ChatMessage[];
  cursor: string | null;
}

export interface SeroAgentNodesAPI {
  list(): Promise<AgentNodeInfo[]>;
  enrol(input: AgentNodeEnrolInput): Promise<AgentNodeInfo>;
  remove(nodeId: string): Promise<void>;
  connect(nodeId: string): Promise<AgentNodeInfo>;
  control(nodeId: string, args: AgentNodeControlArgs): Promise<AgentNodeControlResponse>;
  send(input: AgentNodeMessageInput): Promise<void>;
  getTask(nodeId: string, taskId: string): Promise<unknown>;
  cancelTask(nodeId: string, taskId: string): Promise<void>;
  attach(nodeId: string, contextId: string, cursor?: string): Promise<AgentNodeAttachResult>;
  readBlob(nodeId: string, blobId: string): Promise<Uint8Array>;
  onEvent(callback: (event: AgentNodeEvent) => void): () => void;
}
