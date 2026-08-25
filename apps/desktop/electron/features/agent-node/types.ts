import type { AgentNodeConnectionState, AgentNodeInfo } from '@/types/ipc-agent-node';

export interface StoredAgentNode {
  id: string;
  name: string;
  address: string;
  fingerprint: string;
  controlUrl: string | null;
  tools: string[];
  createdAt: string;
}

export interface AgentNodeRegistryFile {
  version: 1;
  nodes: StoredAgentNode[];
}

export interface RuntimeNode {
  stored: StoredAgentNode;
  state: AgentNodeConnectionState;
  lastSeenAt: string | null;
}

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface ControlErrorBody {
  error: { code: string; message: string };
}

export interface EnrolWireResult {
  controllerId: string;
  token: string;
}

export function rendererNode(node: RuntimeNode): AgentNodeInfo {
  const { id, name, address, fingerprint, tools } = node.stored;
  return { id, name, address, fingerprint, tools, state: node.state, lastSeenAt: node.lastSeenAt };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
