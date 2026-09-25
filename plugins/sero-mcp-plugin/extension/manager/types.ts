import type { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { McpFailurePhase } from '../../shared/types';
import type { SSEClientTransport, StreamableHTTPClientTransport, Client, ProtocolEra } from '@modelcontextprotocol/client';

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

/** What Sero negotiated with a connected server. */
export interface ManagedConnectionProtocol {
  era: ProtocolEra;
  version: string | null;
  /** Extension IDs that the server declares. */
  extensions: string[];
  serverVersion: { name: string; version: string } | null;
  /** True when the connection uses the deprecated SSE transport. */
  deprecatedTransport: boolean;
  /** True when a saved legacy verdict skipped the server/discover probe. */
  eraFromVerdict: boolean;
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
  protocol?: ManagedConnectionProtocol;
  failurePhase?: McpFailurePhase;
  /** The account that the connection uses: `anon`, `bearer:<sha256>` or `oauth:<id>`. */
  principalId?: string;
}
