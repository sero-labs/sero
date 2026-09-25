import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client, SSEClientTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/client';
import { promises as fs } from 'node:fs';
import { McpOAuthProvider } from '../auth/oauth-provider';
import { resolvePrincipalId } from '../auth/principal';
import { computeServerHash } from '../cache/metadata-cache';
import type { McpFailurePhase } from '../../shared/types';
import { resolveBearerTokenValue, type McpServerConfig } from '../config/types';
import { runWithRequestContext } from '../elicitation/request-context';
import { createMcpClient } from './client-factory';
import {
  buildRequestInit,
  isMissingEndpointError,
  isPathInside,
  mergeCacheHints,
  normalizeResources,
  normalizeTools,
  readCacheHints,
  readProtocol,
  resolveEnv,
} from './connection-helpers';
import { createMemoryEraVerdictStore, type EraVerdictStore } from './era-verdicts';
import { failurePhaseOf, isUnauthorizedError, McpConnectError } from './failure-phase';
import type {
  ManagedCacheHints,
  ManagedConnection,
  ManagedConnectionProtocol,
  ManagedResource,
  ManagedTool,
  ManagedTransport,
} from './types';

export interface McpCallOptions {
  /** Stops only this request. */
  signal?: AbortSignal;
  /** Shows a short message in the chat that made the call. */
  notify?: (text: string) => void;
}

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

  async readResource(name: string, uri: string, options: McpCallOptions = {}): Promise<ReadResourceResult> {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server "${name}" is not connected.`);
    }
    const client = connection.client;
    return runWithRequestContext(
      { serverLabel: name, notify: options.notify },
      () => client.readResource({ uri }, { signal: options.signal }),
    );
  }

  async callTool(
    name: string,
    toolName: string,
    toolArguments?: Record<string, unknown>,
    options: McpCallOptions = {},
  ): Promise<CallToolResult> {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server "${name}" is not connected.`);
    }
    const client = connection.client;
    return runWithRequestContext(
      { serverLabel: name, toolName, notify: options.notify },
      () => client.callTool({ name: toolName, arguments: toolArguments }, { signal: options.signal }),
    );
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

    const principalId = await resolvePrincipalId(name, definition);
    if (definition.command) {
      return this.connectStdio(name, definition, principalId);
    }

    if (definition.url) {
      return this.connectHttp(name, definition, principalId, bearerToken);
    }

    return this.createDisconnectedConnection(name, 'error', 'Server has no command or URL.');
  }

  private async connectStdio(name: string, definition: McpServerConfig, principalId: string): Promise<ManagedConnection> {
    const pluginData = definition.env?.PLUGIN_DATA;
    if (pluginData && definition.cwd && isPathInside(pluginData, definition.cwd)) {
      await fs.mkdir(definition.cwd, { recursive: true });
    }
    const client = createMcpClient(`sero-mcp-${name}`, { serverLabel: name, cachePartition: principalId });
    const transport = new StdioClientTransport({
      command: definition.command!,
      args: definition.args ?? [],
      env: resolveEnv(definition.env, definition.literalEnv === true),
      cwd: definition.cwd,
      stderr: definition.debug ? 'inherit' : 'ignore',
    });

    try {
      return await this.openConnection(name, definition, principalId, client, transport);
    } catch (error) {
      await this.safeClose(client, transport);
      return this.createErrorConnection(name, error);
    }
  }

  private async connectHttp(
    name: string,
    definition: McpServerConfig,
    principalId: string,
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
      return this.connectSse(name, definition, principalId, url, requestInit, authProvider);
    }

    const streamableClient = createMcpClient(`sero-mcp-${name}`, { serverLabel: name, cachePartition: principalId });
    const streamableTransport = new StreamableHTTPClientTransport(url, { requestInit, authProvider });
    try {
      return await this.openConnection(name, definition, principalId, streamableClient, streamableTransport);
    } catch (error) {
      await this.safeClose(streamableClient, streamableTransport);
      if (isUnauthorizedError(error)) {
        return this.createDisconnectedConnection(name, 'needs-auth', 'Authentication is required before connecting.', 'auth');
      }
      // Only a server without a Streamable HTTP endpoint gets the deprecated SSE fallback.
      if (definition.portableTransport === 'streamable-http' || !isMissingEndpointError(error)) {
        return this.createErrorConnection(name, error);
      }
    }

    return this.connectSse(name, definition, principalId, url, requestInit, authProvider);
  }

  private async connectSse(
    name: string,
    definition: McpServerConfig,
    principalId: string,
    url: URL,
    requestInit: { headers?: Record<string, string>; redirect?: 'manual' } | undefined,
    authProvider: McpOAuthProvider | undefined,
  ): Promise<ManagedConnection> {
    const sseClient = createMcpClient(`sero-mcp-${name}`, { serverLabel: name, cachePartition: principalId });
    const sseTransport = new SSEClientTransport(url, { requestInit, authProvider });
    try {
      return await this.openConnection(name, definition, principalId, sseClient, sseTransport, true);
    } catch (error) {
      await this.safeClose(sseClient, sseTransport);
      return this.createErrorConnection(name, error);
    }
  }

  private async openConnection(
    name: string,
    definition: McpServerConfig,
    principalId: string,
    client: Client,
    transport: ManagedTransport,
    deprecatedTransport = false,
  ): Promise<ManagedConnection> {
    const configHash = computeServerHash(definition);
    const eraFromVerdict = await this.eraVerdicts.isLegacy(name, configHash);
    try {
      await client.connect(transport, eraFromVerdict ? { prior: { kind: 'legacy' } } : undefined);
    } catch (error) {
      const legacyChosen = eraFromVerdict || client.getProtocolEra() === 'legacy';
      throw new McpConnectError(failurePhaseOf(error, legacyChosen ? 'legacy-fallback' : 'discovery'), error);
    }
    const [{ tools, hints: toolHints }, { resources, hints: resourceHints }] = await Promise.all([
      this.fetchAllTools(client),
      this.fetchAllResources(client),
    ]);
    const protocol = readProtocol(client, deprecatedTransport, eraFromVerdict);
    if (protocol.era === 'legacy') {
      await this.eraVerdicts.setLegacy(name, configHash);
    } else {
      await this.eraVerdicts.clear(name);
    }
    return {
      ...this.createConnectedConnection(name, client, transport, tools, resources, protocol),
      principalId,
      cacheHints: mergeCacheHints(toolHints, resourceHints),
    };
  }

  // Without a cursor, the v2 client walks every page and fills its response cache.
  private async fetchAllTools(client: Client): Promise<{ tools: ManagedTool[]; hints: ManagedCacheHints }> {
    const result = await client.listTools();
    return { tools: normalizeTools(result.tools), hints: readCacheHints(result) };
  }

  private async fetchAllResources(client: Client): Promise<{ resources: ManagedResource[]; hints: ManagedCacheHints | null }> {
    try {
      const result = await client.listResources();
      return { resources: normalizeResources(result.resources), hints: readCacheHints(result) };
    } catch {
      return { resources: [], hints: null };
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
    failurePhase?: McpFailurePhase,
  ): ManagedConnection {
    return {
      name,
      client: null,
      transport: null,
      tools: [],
      resources: [],
      status,
      lastError,
      failurePhase,
      lastConnectedAt: null,
      lastFailedAt: new Date().toISOString(),
    };
  }

  private createErrorConnection(name: string, error: unknown): ManagedConnection {
    const message = error instanceof Error ? error.message : String(error);
    return this.createDisconnectedConnection(name, 'error', message, failurePhaseOf(error, 'discovery'));
  }

  private async safeClose(client: Client, transport: ManagedTransport): Promise<void> {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

export { buildRequestInit, resolveEnv };
