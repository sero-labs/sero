import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { UnauthorizedError, Client, SSEClientTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { McpOAuthProvider } from '../auth/oauth-provider';
import { computeServerHash } from '../cache/metadata-cache';
import { resolveBearerTokenValue, type McpServerConfig } from '../config/types';
import { createMcpClient } from './client-factory';
import { createMemoryEraVerdictStore, type EraVerdictStore } from './era-verdicts';
import type { ManagedConnection, ManagedConnectionProtocol, ManagedResource, ManagedTool, ManagedTransport } from './types';

interface McpServerManagerOptions {
  hasOAuthTokens?: (serverName: string, serverUrl?: string) => Promise<boolean>;
  eraVerdicts?: EraVerdictStore;
}

export class McpServerManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly connectPromises = new Map<string, Promise<ManagedConnection>>();
  private readonly hasOAuthTokens: (serverName: string, serverUrl?: string) => Promise<boolean>;
  private readonly eraVerdicts: EraVerdictStore;

  constructor(options: McpServerManagerOptions = {}) {
    this.hasOAuthTokens = options.hasOAuthTokens ?? (async () => false);
    this.eraVerdicts = options.eraVerdicts ?? createMemoryEraVerdictStore();
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

  /** A manual reconnect passes `reprobe` so that a saved legacy verdict is dropped and the era is probed again. */
  async reconnect(name: string, definition: McpServerConfig, options: { reprobe?: boolean } = {}): Promise<ManagedConnection> {
    await this.close(name);
    if (options.reprobe) {
      await this.eraVerdicts.clear(name);
    }
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
    return connection.client.callTool({
      name: toolName,
      arguments: toolArguments,
    });
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
    const pluginData = definition.env?.PLUGIN_DATA;
    if (pluginData && definition.cwd && isPathInside(pluginData, definition.cwd)) {
      await fs.mkdir(definition.cwd, { recursive: true });
    }
    const client = createMcpClient(`sero-mcp-${name}`);
    const transport = new StdioClientTransport({
      command: definition.command!,
      args: definition.args ?? [],
      env: resolveEnv(definition.env, definition.literalEnv === true),
      cwd: definition.cwd,
      stderr: definition.debug ? 'inherit' : 'ignore',
    });

    try {
      return await this.openConnection(name, definition, client, transport);
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

    if (definition.portableTransport === 'sse') {
      return this.connectSse(name, definition, url, requestInit);
    }

    const streamableClient = createMcpClient(`sero-mcp-${name}`);
    const streamableTransport = new StreamableHTTPClientTransport(url, { requestInit, authProvider });
    try {
      return await this.openConnection(name, definition, streamableClient, streamableTransport);
    } catch (error) {
      await this.safeClose(streamableClient, streamableTransport);
      if (error instanceof UnauthorizedError) {
        return this.createDisconnectedConnection(name, 'needs-auth', 'Authentication is required before connecting.');
      }
      if (definition.portableTransport === 'streamable-http') {
        return this.createErrorConnection(name, error);
      }
    }

    return this.connectSse(name, definition, url, requestInit);
  }

  private async connectSse(
    name: string,
    definition: McpServerConfig,
    url: URL,
    requestInit: { headers?: Record<string, string>; redirect?: 'manual' } | undefined,
  ): Promise<ManagedConnection> {
    const sseClient = createMcpClient(`sero-mcp-${name}`);
    const sseTransport = new SSEClientTransport(url, { requestInit });
    try {
      return await this.openConnection(name, definition, sseClient, sseTransport, true);
    } catch (error) {
      await this.safeClose(sseClient, sseTransport);
      return this.createErrorConnection(name, error);
    }
  }

  private async openConnection(
    name: string,
    definition: McpServerConfig,
    client: Client,
    transport: ManagedTransport,
    deprecatedTransport = false,
  ): Promise<ManagedConnection> {
    const configHash = computeServerHash(definition);
    const eraFromVerdict = await this.eraVerdicts.isLegacy(name, configHash);
    await client.connect(transport, eraFromVerdict ? { prior: { kind: 'legacy' } } : undefined);
    const [tools, resources] = await Promise.all([
      this.fetchAllTools(client),
      this.fetchAllResources(client),
    ]);
    const protocol = readProtocol(client, deprecatedTransport, eraFromVerdict);
    if (protocol.era === 'legacy') {
      await this.eraVerdicts.setLegacy(name, configHash);
    } else {
      await this.eraVerdicts.clear(name);
    }
    return this.createConnectedConnection(name, client, transport, tools, resources, protocol);
  }

  // Without a cursor, the v2 client walks every page and fills its response cache.
  private async fetchAllTools(client: Client): Promise<ManagedTool[]> {
    const result = await client.listTools();
    return normalizeTools(result.tools);
  }

  private async fetchAllResources(client: Client): Promise<ManagedResource[]> {
    try {
      const result = await client.listResources();
      return normalizeResources(result.resources);
    } catch {
      return [];
    }
  }

  private createConnectedConnection(
    name: string,
    client: Client,
    transport: ManagedTransport,
    tools: ManagedTool[],
    resources: ManagedResource[],
    protocol: ManagedConnectionProtocol,
  ): ManagedConnection {
    return {
      name,
      client,
      transport,
      tools,
      resources,
      protocol,
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

function readProtocol(client: Client, deprecatedTransport: boolean, eraFromVerdict: boolean): ManagedConnectionProtocol {
  const serverVersion = client.getServerVersion();
  return {
    era: client.getProtocolEra() ?? 'legacy',
    version: client.getNegotiatedProtocolVersion() ?? null,
    extensions: Object.keys(client.getServerCapabilities()?.extensions ?? {}).sort(),
    serverVersion: serverVersion ? { name: serverVersion.name, version: serverVersion.version } : null,
    deprecatedTransport,
    eraFromVerdict,
  };
}

export function resolveEnv(env: Record<string, string> | undefined, literal: boolean): Record<string, string> | undefined {
  if (!env) return undefined;
  const resolved = literal
    ? env
    : Object.fromEntries(
        Object.entries(env).map(([key, value]) => [key, expandEnvReferences(value)]),
      );
  return literal ? { ...getDefaultEnvironment(), ...resolved } : resolved;
}

function expandEnvReferences(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, key: string) => process.env[key] ?? '');
}

export function buildRequestInit(
  definition: McpServerConfig,
  bearerToken?: string,
): { headers?: Record<string, string>; redirect?: 'manual' } | undefined {
  const headers: Record<string, string> = { ...(definition.headers ?? {}) };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const redirect = definition.managedByAgentPlugin ? { redirect: 'manual' as const } : {};
  return Object.keys(headers).length > 0
    ? { headers, ...redirect }
    : definition.managedByAgentPlugin ? redirect : undefined;
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
