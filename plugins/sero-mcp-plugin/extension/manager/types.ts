import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export type ManagedTransport =
  | StdioClientTransport
  | StreamableHTTPClientTransport
  | SSEClientTransport;

export interface ManagedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _meta?: Record<string, unknown>;
}

export interface ManagedResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
}

export interface ManagedConnection {
  name: string;
  client: Client | null;
  transport: ManagedTransport | null;
  tools: ManagedTool[];
  resources: ManagedResource[];
  status: 'connected' | 'needs-auth' | 'error' | 'closed';
  lastError?: string;
  lastConnectedAt?: string | null;
  lastFailedAt?: string | null;
}
