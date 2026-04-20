import type { McpAppState, McpAuthStatus, McpConnectionStatus, McpServerSnapshot } from '../../shared/types';
import type { McpMetadataCacheDocument } from '../cache/metadata-cache';
import type { McpConfigDocument, McpServerConfig } from '../config/types';

interface BuildSnapshotOptions {
  configPath: string;
  rawConfigUpdatedAt: string | null;
  config: McpConfigDocument;
  metadataCache: McpMetadataCacheDocument;
  hasOAuthTokens: (serverName: string) => Promise<boolean>;
}

export async function buildSnapshot(options: BuildSnapshotOptions): Promise<McpAppState> {
  const servers = await Promise.all(
    Object.entries(options.config.mcpServers).map(([serverName, serverConfig]) => {
      return createServerSnapshot(serverName, serverConfig, options.metadataCache, options.hasOAuthTokens);
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
  metadataCache: McpMetadataCacheDocument,
  hasOAuthTokens: (serverName: string) => Promise<boolean>,
): Promise<McpServerSnapshot> {
  const enabled = serverConfig.enabled !== false;
  const authStatus = await resolveAuthStatus(serverName, serverConfig, hasOAuthTokens);
  const metadata = metadataCache.servers[serverName];

  return {
    serverName,
    enabled,
    transport: typeof serverConfig.url === 'string' && serverConfig.url.length > 0 ? 'http' : 'stdio',
    lifecycle: serverConfig.lifecycle ?? 'lazy',
    authMode: resolveAuthMode(serverConfig),
    connectionStatus: resolveConnectionStatus(enabled, authStatus),
    authStatus,
    toolCount: metadata?.toolCount ?? 0,
    resourceCount: metadata?.resourceCount ?? 0,
    uiToolCount: 0,
    command: typeof serverConfig.command === 'string' ? serverConfig.command : undefined,
    argsText: Array.isArray(serverConfig.args) ? serverConfig.args.join('\n') : undefined,
    cwd: typeof serverConfig.cwd === 'string' ? serverConfig.cwd : undefined,
    url: typeof serverConfig.url === 'string' ? serverConfig.url : undefined,
    bearerTokenEnv: typeof serverConfig.bearerTokenEnv === 'string' ? serverConfig.bearerTokenEnv : undefined,
    exposeResources: typeof serverConfig.exposeResources === 'boolean' ? serverConfig.exposeResources : true,
    debug: typeof serverConfig.debug === 'boolean' ? serverConfig.debug : false,
    lastError: undefined,
    lastConnectedAt: null,
    lastFailedAt: null,
    resources: [],
    uiTools: [],
  };
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

function resolveAuthMode(serverConfig: McpServerConfig): 'none' | 'oauth' | 'bearer' {
  if (serverConfig.auth === 'oauth') return 'oauth';
  if (serverConfig.auth === 'bearer') return 'bearer';
  return 'none';
}

function resolveConnectionStatus(enabled: boolean, authStatus: McpAuthStatus): McpConnectionStatus {
  if (!enabled) return 'disabled';
  if (authStatus === 'not-authenticated') return 'needs-auth';
  return 'idle';
}
