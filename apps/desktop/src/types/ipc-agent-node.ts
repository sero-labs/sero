import type { AgentStreamEvent, ChatAttachment, ChatMessage } from './agent';
import {
  CONTROL_OPERATION_NAMES,
  type AuthEvent,
  type ControlOperationName,
  type ControlRequest,
  type ControlResponse,
  type Controller,
  type NodeHealth,
  type Session,
} from '@sero-ai/a2a';

export const AGENT_NODE_CONTROL_OPERATIONS = CONTROL_OPERATION_NAMES;

export type AgentNodeControlOperation = ControlOperationName;

export type AgentNodeConnectionState =
  | 'disconnected'
  | 'connected'
  | 'reconnecting'
  | 'unreachable'
  | 'restarted'
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

export type AgentNodeSession = Session;
export type AgentNodeController = Controller;
export type AgentNodeHealth = NodeHealth;

export interface AgentNodeControlRequestMap {
  enrol: ControlRequest<'enrol'>;
  mintEnrolmentCode: ControlRequest<'mintEnrolmentCode'>;
  listControllers: ControlRequest<'listControllers'>;
  revokeController: ControlRequest<'revokeController'>;
  listSessions: ControlRequest<'listSessions'>;
  createSession: ControlRequest<'createSession'>;
  deleteSession: ControlRequest<'deleteSession'>;
  setSessionModel: ControlRequest<'setSessionModel'>;
  getNodeHealth: ControlRequest<'getNodeHealth'>;
  getProviders: ControlRequest<'getProviders'>;
  login: ControlRequest<'login'>;
  logout: ControlRequest<'logout'>;
  setApiKey: ControlRequest<'setApiKey'>;
  removeApiKey: ControlRequest<'removeApiKey'>;
  respondPrompt: ControlRequest<'respondPrompt'>;
  respondSelect: ControlRequest<'respondSelect'>;
  respondManualCode: ControlRequest<'respondManualCode'>;
  cancel: ControlRequest<'cancel'>;
}

export interface AgentNodeControlResponseMap {
  enrol: ControlResponse<'enrol'>;
  mintEnrolmentCode: ControlResponse<'mintEnrolmentCode'>;
  listControllers: ControlResponse<'listControllers'>;
  revokeController: ControlResponse<'revokeController'>;
  listSessions: ControlResponse<'listSessions'>;
  createSession: ControlResponse<'createSession'>;
  deleteSession: ControlResponse<'deleteSession'>;
  setSessionModel: ControlResponse<'setSessionModel'>;
  getNodeHealth: ControlResponse<'getNodeHealth'>;
  getProviders: ControlResponse<'getProviders'>;
  login: ControlResponse<'login'>;
  logout: ControlResponse<'logout'>;
  setApiKey: ControlResponse<'setApiKey'>;
  removeApiKey: ControlResponse<'removeApiKey'>;
  respondPrompt: ControlResponse<'respondPrompt'>;
  respondSelect: ControlResponse<'respondSelect'>;
  respondManualCode: ControlResponse<'respondManualCode'>;
  cancel: ControlResponse<'cancel'>;
}

export type AgentNodeRendererControlOperation = Exclude<AgentNodeControlOperation, 'enrol'>;
export type AgentNodeControlArgs<Name extends AgentNodeRendererControlOperation = AgentNodeRendererControlOperation> = {
  [Operation in AgentNodeRendererControlOperation]: {
    operation: Operation;
    params: AgentNodeControlRequestMap[Operation];
  }
}[Name];

export type AgentNodeControlResponse<Name extends AgentNodeRendererControlOperation = AgentNodeRendererControlOperation> =
  AgentNodeControlResponseMap[Name];

export interface AgentNodeMessageInput {
  nodeId: string;
  contextId: string;
  text: string;
  attachments?: ChatAttachment[];
  taskId?: string;
  mode?: 'steer' | 'followUp';
  approval?: {
    id: string;
    approved: boolean;
  };
}

export interface AgentNodeSendResult {
  taskId: string;
}

export interface AgentNodeApproval {
  id: string;
  taskId: string;
  contextId: string;
  title: string;
  description?: string;
}

export type AgentNodeEvent =
  | { type: 'connection'; nodeId: string; state: AgentNodeConnectionState }
  | { type: 'conversation'; nodeId: string; event: AgentStreamEvent }
  | { type: 'artifact'; nodeId: string; sessionKey: string; artifact: AgentNodeArtifact }
  | { type: 'approval'; nodeId: string; sessionKey: string; approval: AgentNodeApproval }
  | { type: 'node'; nodeId: string; event: unknown }
  | { type: 'auth'; nodeId: string; event: AuthEvent };

export interface AgentNodeAttachResult {
  sessionKey: string;
  messages: ChatMessage[];
  cursor: string | null;
}

export interface AgentNodeArtifact {
  id: string;
  name: string;
  mediaType: string;
  inlineBase64?: string;
  blobId?: string;
}

export interface SeroAgentNodesAPI {
  list(): Promise<AgentNodeInfo[]>;
  enrol(input: AgentNodeEnrolInput): Promise<AgentNodeInfo>;
  remove(nodeId: string): Promise<void>;
  connect(nodeId: string): Promise<AgentNodeInfo>;
  control<Name extends AgentNodeRendererControlOperation>(
    nodeId: string,
    args: { operation: Name; params: AgentNodeControlRequestMap[Name] },
  ): Promise<AgentNodeControlResponse<Name>>;
  send(input: AgentNodeMessageInput): Promise<AgentNodeSendResult>;
  getTask(nodeId: string, taskId: string): Promise<unknown>;
  cancelTask(nodeId: string, taskId: string): Promise<void>;
  attach(nodeId: string, contextId: string, cursor?: string, taskId?: string): Promise<AgentNodeAttachResult>;
  readBlob(nodeId: string, blobId: string): Promise<Uint8Array>;
  onEvent(callback: (event: AgentNodeEvent) => void): () => void;
}
