import type {
  McpAppState,
  McpAuthMode,
  McpAuthStatus,
  McpConnectionStatus,
  McpResourceSummary,
  McpServerSnapshot,
  McpUiToolSummary,
} from '../../shared/types';
import {
  isMetadataCacheEntryValid,
  type CachedMcpResource,
  type CachedMcpTool,
  type McpMetadataCacheDocument,
} from '../cache/metadata-cache';
import type { McpConfigDocument, McpServerConfig } from '../config/types';

export interface RuntimeServerStatus {
  connectionStatus?: McpConnectionStatus;
  authStatus?: McpAuthStatus;
  lastError?: string;
  lastConnectedAt?: string | null;
  lastFailedAt?: string | null;
}

interface BuildSnapshotOptions {
  configPath: string;
  rawConfigUpdatedAt: string | null;
  config: McpConfigDocument;
  metadataCache: McpMetadataCacheDocument;
  hasOAuthTokens: (serverName: string) => Promise<boolean>;
  runtimeStatuses?: Map<string, RuntimeServerStatus>;
}

export async function buildSnapshot(options: BuildSnapshotOptions): Promise<McpAppState> {
  const servers = await Promise.all(
    Object.entries(options.config.mcpServers).map(([serverName, serverConfig]) => {
      return createServerSnapshot(serverName, serverConfig, options);
    }),
  );

  const enabledServers = servers.filter((server) => server.enabled).length;
  const connectedServers = servers.filter((server) => server.connectionStatus === 'connected').length;
  const needsAuthServers = servers.filter((server) => server.authStatus === 'not-authenticated').length;
  const errorServers = servers.filter((server) => server.connectionStatus === 'error' || server.authStatus === 'error').length;

  return {
    initialized: true,
    firstRun: servers.length === 0,
    configPath: options.configPath,
    rawConfigUpdatedAt: options.rawConfigUpdatedAt,
    servers,
    settings: {
      idleTimeout: options.config.settings?.idleTimeout ?? 10,
      toolPrefix: options.config.settings?.toolPrefix ?? 'server',
    },
    lastRefreshedAt: new Date().toISOString(),
    summary: {
      totalServers: servers.length,
      enabledServers,
      connectedServers,
      needsAuthServers,
      errorServers,
    },
  };
}

async function createServerSnapshot(
  serverName: string,
  serverConfig: McpServerConfig,
  options: BuildSnapshotOptions,
): Promise<McpServerSnapshot> {
  const enabled = serverConfig.enabled !== false;
  const runtimeStatus = options.runtimeStatuses?.get(serverName);
  const derivedAuthStatus = await resolveAuthStatus(serverName, serverConfig, options.hasOAuthTokens);
  const authStatus = runtimeStatus?.authStatus ?? derivedAuthStatus;
  const metadata = getValidMetadata(serverName, serverConfig, options.metadataCache);
  const uiTools = buildUiToolSummaries(metadata?.tools ?? []);
  const resources = buildResourceSummaries(metadata?.resources ?? []);

  return {
    serverName,
    enabled,
    transport: resolveTransport(serverConfig),
    lifecycle: serverConfig.lifecycle ?? 'lazy',
    authMode: resolveAuthMode(serverConfig),
    connectionStatus: enabled
      ? runtimeStatus?.connectionStatus ?? resolveConnectionStatus(authStatus)
      : 'disabled',
    authStatus,
    toolCount: metadata?.toolCount ?? 0,
    resourceCount: metadata?.resourceCount ?? 0,
    uiToolCount: uiTools.length,
    command: typeof serverConfig.command === 'string' ? serverConfig.command : undefined,
    argsText: Array.isArray(serverConfig.args) ? serverConfig.args.join('\n') : undefined,
    cwd: typeof serverConfig.cwd === 'string' ? serverConfig.cwd : undefined,
    url: typeof serverConfig.url === 'string' ? serverConfig.url : undefined,
    bearerTokenEnv: typeof serverConfig.bearerTokenEnv === 'string' ? serverConfig.bearerTokenEnv : undefined,
    exposeResources: typeof serverConfig.exposeResources === 'boolean' ? serverConfig.exposeResources : true,
    debug: typeof serverConfig.debug === 'boolean' ? serverConfig.debug : false,
    lastError: runtimeStatus?.lastError,
    lastConnectedAt: runtimeStatus?.lastConnectedAt ?? null,
    lastFailedAt: runtimeStatus?.lastFailedAt ?? null,
    resources,
    uiTools,
  };
}

function getValidMetadata(
  serverName: string,
  serverConfig: McpServerConfig,
  metadataCache: McpMetadataCacheDocument,
) {
  const entry = metadataCache.servers[serverName];
  return isMetadataCacheEntryValid(entry, serverConfig) ? entry : undefined;
}

async function resolveAuthStatus(
  serverName: string,
  serverConfig: McpServerConfig,
  hasOAuthTokens: (serverName: string) => Promise<boolean>,
): Promise<McpAuthStatus> {
  if (serverConfig.auth === 'oauth') {
    return (await hasOAuthTokens(serverName)) ? 'authenticated' : 'not-authenticated';
  }

  if (serverConfig.auth === 'bearer') {
    return serverConfig.bearerToken || serverConfig.bearerTokenEnv ? 'authenticated' : 'not-authenticated';
  }

  return 'not-required';
}

function resolveTransport(serverConfig: McpServerConfig): 'stdio' | 'http' {
  if (serverConfig.transport === 'stdio' || serverConfig.transport === 'http') {
    return serverConfig.transport;
  }
  return typeof serverConfig.url === 'string' && serverConfig.url.length > 0 ? 'http' : 'stdio';
}

function resolveAuthMode(serverConfig: McpServerConfig): McpAuthMode {
  if (serverConfig.auth === 'oauth') return 'oauth';
  if (serverConfig.auth === 'bearer') return 'bearer';
  return 'none';
}

function resolveConnectionStatus(authStatus: McpAuthStatus): McpConnectionStatus {
  if (authStatus === 'not-authenticated') return 'needs-auth';
  return 'idle';
}

function buildUiToolSummaries(tools: CachedMcpTool[]): McpUiToolSummary[] {
  return tools
    .filter((tool) => !!tool.uiResourceUri)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
}

function buildResourceSummaries(resources: CachedMcpResource[]): McpResourceSummary[] {
  return resources.map((resource) => ({
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
  }));
}
