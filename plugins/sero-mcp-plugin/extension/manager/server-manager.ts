import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { McpOAuthProvider } from '../auth/oauth-provider';
import { resolveBearerTokenValue, type McpServerConfig } from '../config/types';
import type { ManagedConnection, ManagedResource, ManagedTool, ManagedTransport } from './types';

interface McpServerManagerOptions {
  hasOAuthTokens?: (serverName: string, serverUrl?: string) => Promise<boolean>;
}

export class McpServerManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly connectPromises = new Map<string, Promise<ManagedConnection>>();
  private readonly hasOAuthTokens: (serverName: string, serverUrl?: string) => Promise<boolean>;

  constructor(options: McpServerManagerOptions = {}) {
    this.hasOAuthTokens = options.hasOAuthTokens ?? (async () => false);
  }

  async connect(name: string, definition: McpServerConfig): Promise<ManagedConnection> {
    if (this.connectPromises.has(name)) {
      return this.connectPromises.get(name)!;
    }

    const existing = this.connections.get(name);
    if (existing?.status === 'connected') {
      return existing;
    }

    const promise = this.createConnection(name, definition);
    this.connectPromises.set(name, promise);

    try {
      const connection = await promise;
      this.connections.set(name, connection);
      return connection;
    } finally {
      this.connectPromises.delete(name);
    }
  }

  async reconnect(name: string, definition: McpServerConfig): Promise<ManagedConnection> {
    await this.close(name);
    return this.connect(name, definition);
  }

  getConnection(name: string): ManagedConnection | undefined {
    return this.connections.get(name);
  }

  async readResource(name: string, uri: string): Promise<ReadResourceResult> {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server "${name}" is not connected.`);
    }
    return connection.client.readResource({ uri });
  }

  async callTool(name: string, toolName: string, toolArguments?: Record<string, unknown>): Promise<CallToolResult> {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server "${name}" is not connected.`);
    }
    const result = await connection.client.callTool({
      name: toolName,
      arguments: toolArguments,
    });
    return result as CallToolResult;
  }

  async close(name: string): Promise<void> {
    const connection = this.connections.get(name);
    this.connections.delete(name);
    if (!connection) return;
    await Promise.allSettled([
      connection.client?.close() ?? Promise.resolve(),
      connection.transport?.close() ?? Promise.resolve(),
    ]);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((name) => this.close(name)));
  }

  private async createConnection(name: string, definition: McpServerConfig): Promise<ManagedConnection> {
    if (definition.auth === 'oauth' && !(await this.hasOAuthTokens(name, definition.url))) {
      return this.createDisconnectedConnection(name, 'needs-auth', 'OAuth authentication is required before connecting.');
    }

    const bearerToken = resolveBearerTokenValue(definition);
    if (definition.auth === 'bearer' && !bearerToken) {
      return this.createDisconnectedConnection(name, 'needs-auth', 'Bearer authentication is configured but no token is available.');
    }

    if (definition.command) {
      return this.connectStdio(name, definition);
    }

    if (definition.url) {
      return this.connectHttp(name, definition, bearerToken);
    }

    return this.createDisconnectedConnection(name, 'error', 'Server has no command or URL.');
  }

  private async connectStdio(name: string, definition: McpServerConfig): Promise<ManagedConnection> {
    const client = new Client({ name: `sero-mcp-${name}`, version: '0.1.0' });
    const transport = new StdioClientTransport({
      command: definition.command!,
      args: definition.args ?? [],
      env: resolveEnv(definition.env),
      cwd: definition.cwd,
      stderr: definition.debug ? 'inherit' : 'ignore',
    });

    try {
      await client.connect(transport);
      const tools = await this.fetchAllTools(client);
      const resources = await this.fetchAllResources(client);
      return this.createConnectedConnection(name, client, transport, tools, resources);
    } catch (error) {
      await this.safeClose(client, transport);
      return this.createErrorConnection(name, error);
    }
  }

  private async connectHttp(
    name: string,
    definition: McpServerConfig,
    bearerToken?: string,
  ): Promise<ManagedConnection> {
    const url = new URL(definition.url!);
    const requestInit = buildRequestInit(definition, bearerToken);
    const authProvider = definition.auth === 'oauth'
      ? new McpOAuthProvider(name, definition.url!, definition.oauth || {}, {
          onRedirect: async () => {},
        })
      : undefined;

    const streamableClient = new Client({ name: `sero-mcp-${name}`, version: '0.1.0' });
    const streamableTransport = new StreamableHTTPClientTransport(url, { requestInit, authProvider });
    try {
      await streamableClient.connect(streamableTransport);
      const tools = await this.fetchAllTools(streamableClient);
      const resources = await this.fetchAllResources(streamableClient);
      return this.createConnectedConnection(name, streamableClient, streamableTransport, tools, resources);
    } catch (error) {
      await this.safeClose(streamableClient, streamableTransport);
      if (error instanceof UnauthorizedError) {
        return this.createDisconnectedConnection(name, 'needs-auth', 'Authentication is required before connecting.');
      }
    }

    const sseClient = new Client({ name: `sero-mcp-${name}`, version: '0.1.0' });
    const sseTransport = new SSEClientTransport(url, { requestInit });
    try {
      await sseClient.connect(sseTransport);
      const tools = await this.fetchAllTools(sseClient);
      const resources = await this.fetchAllResources(sseClient);
      return this.createConnectedConnection(name, sseClient, sseTransport, tools, resources);
    } catch (error) {
      await this.safeClose(sseClient, sseTransport);
      return this.createErrorConnection(name, error);
    }
  }

  private async fetchAllTools(client: Client): Promise<ManagedTool[]> {
    const tools: ManagedTool[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...normalizeTools(result.tools));
      cursor = result.nextCursor;
    } while (cursor);

    return tools;
  }

  private async fetchAllResources(client: Client): Promise<ManagedResource[]> {
    const resources: ManagedResource[] = [];
    let cursor: string | undefined;

    try {
      do {
        const result = await client.listResources(cursor ? { cursor } : undefined);
        resources.push(...normalizeResources(result.resources));
        cursor = result.nextCursor;
      } while (cursor);
    } catch {
      return [];
    }

    return resources;
  }

  private createConnectedConnection(
    name: string,
    client: Client,
    transport: ManagedTransport,
    tools: ManagedTool[],
    resources: ManagedResource[],
  ): ManagedConnection {
    return {
      name,
      client,
      transport,
      tools,
      resources,
      status: 'connected',
      lastConnectedAt: new Date().toISOString(),
      lastFailedAt: null,
    };
  }

  private createDisconnectedConnection(
    name: string,
    status: 'needs-auth' | 'error',
    lastError: string,
  ): ManagedConnection {
    return {
      name,
      client: null,
      transport: null,
      tools: [],
      resources: [],
      status,
      lastError,
      lastConnectedAt: null,
      lastFailedAt: new Date().toISOString(),
    };
  }

  private createErrorConnection(name: string, error: unknown): ManagedConnection {
    const message = error instanceof Error ? error.message : String(error);
    return this.createDisconnectedConnection(name, 'error', message);
  }

  private async safeClose(client: Client, transport: ManagedTransport): Promise<void> {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

function resolveEnv(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, expandEnvReferences(value)]),
  );
}

function expandEnvReferences(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, key: string) => process.env[key] ?? '');
}

function buildRequestInit(definition: McpServerConfig, bearerToken?: string): { headers?: Record<string, string> } | undefined {
  const headers: Record<string, string> = { ...(definition.headers ?? {}) };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  return Object.keys(headers).length > 0 ? { headers } : undefined;
}

function normalizeTools(rawTools: unknown): ManagedTool[] {
  if (!Array.isArray(rawTools)) return [];
  return rawTools
    .filter((tool): tool is Record<string, unknown> => !!tool && typeof tool === 'object' && !Array.isArray(tool))
    .map((tool) => ({
      name: typeof tool.name === 'string' ? tool.name : '',
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.inputSchema,
      _meta: tool._meta && typeof tool._meta === 'object' ? tool._meta as Record<string, unknown> : undefined,
    }))
    .filter((tool) => tool.name.length > 0);
}

function normalizeResources(rawResources: unknown): ManagedResource[] {
  if (!Array.isArray(rawResources)) return [];
  return rawResources
    .filter((resource): resource is Record<string, unknown> => !!resource && typeof resource === 'object' && !Array.isArray(resource))
    .map((resource) => ({
      uri: typeof resource.uri === 'string' ? resource.uri : '',
      name: typeof resource.name === 'string' ? resource.name : '',
      description: typeof resource.description === 'string' ? resource.description : undefined,
      mimeType: typeof resource.mimeType === 'string' ? resource.mimeType : undefined,
      _meta: resource._meta && typeof resource._meta === 'object' ? resource._meta as Record<string, unknown> : undefined,
    }))
    .filter((resource) => resource.uri.length > 0 && resource.name.length > 0);
}
