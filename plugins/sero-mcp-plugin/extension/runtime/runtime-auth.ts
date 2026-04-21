import { McpOAuthCoordinator } from '../auth/oauth-coordinator';
import { readMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
import { McpServerManager } from '../manager/server-manager';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ToolResult } from '../tools/types';
import { reconcileConnection } from './runtime-connect';
import type { SyncedRuntimeState } from './runtime-types';

export async function startServerAuthAction(options: {
  cwd?: string;
  serverName?: string;
  authCoordinator: McpOAuthCoordinator;
  manager: McpServerManager;
  setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
  syncSnapshot: (
    cwd?: string,
    options?: {
      config?: McpConfigDocument;
      metadataCache?: McpMetadataCacheDocument;
      rawConfigUpdatedAt?: string | null;
    },
  ) => Promise<SyncedRuntimeState>;
}): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }

  const synced = await options.syncSnapshot(options.cwd);
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { snapshotWritten: false });
  }
  if (serverConfig.enabled === false) {
    return createToolResult(`Error: Server "${serverName}" is disabled. Enable it before authenticating.`, { snapshotWritten: false });
  }
  if (serverConfig.auth !== 'oauth') {
    return createToolResult(`Error: Server "${serverName}" is not configured for OAuth authentication.`, { snapshotWritten: false });
  }

  const result = await options.authCoordinator.startAuth(serverName, serverConfig);
  if (result.status === 'pending' && result.authUrl) {
    options.setRuntimeStatus(serverName, {
      connectionStatus: 'needs-auth',
      authStatus: 'authenticating',
    });
    await options.syncSnapshot(options.cwd, { config: synced.config });
    return createToolResult(`Authentication started for MCP server "${serverName}".`, {
      snapshotWritten: true,
      serverName,
      authUrl: result.authUrl,
      authStatus: 'authenticating',
      authFlowPending: true,
    });
  }

  const nextState = await reconnectAuthenticatedServer(options, synced, serverName);
  const nextServer = nextState.snapshot.servers.find((server) => server.serverName === serverName);
  return createToolResult(`Authenticated MCP server "${serverName}".`, {
    snapshotWritten: true,
    serverName,
    authStatus: nextServer?.authStatus ?? 'authenticated',
    connectionStatus: nextServer?.connectionStatus ?? 'connected',
  });
}

export async function completeServerAuthAction(options: {
  cwd?: string;
  serverName?: string;
  callbackUrl?: string;
  authCoordinator: McpOAuthCoordinator;
  manager: McpServerManager;
  setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
  syncSnapshot: (
    cwd?: string,
    options?: {
      config?: McpConfigDocument;
      metadataCache?: McpMetadataCacheDocument;
      rawConfigUpdatedAt?: string | null;
    },
  ) => Promise<SyncedRuntimeState>;
}): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  const callbackUrl = options.callbackUrl?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }
  if (!callbackUrl) {
    return createToolResult('Error: OAuth callback URL is required.', { snapshotWritten: false });
  }

  const synced = await options.syncSnapshot(options.cwd);
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { snapshotWritten: false });
  }

  await options.authCoordinator.completeAuth(serverName, callbackUrl);
  const nextState = await reconnectAuthenticatedServer(options, synced, serverName);
  const nextServer = nextState.snapshot.servers.find((server) => server.serverName === serverName);
  return createToolResult(`Completed authentication for MCP server "${serverName}".`, {
    snapshotWritten: true,
    serverName,
    authStatus: nextServer?.authStatus ?? 'authenticated',
    connectionStatus: nextServer?.connectionStatus ?? 'connected',
    toolCount: nextServer?.toolCount ?? 0,
    resourceCount: nextServer?.resourceCount ?? 0,
  });
}

export async function cancelServerAuthAction(options: {
  cwd?: string;
  serverName?: string;
  authCoordinator: McpOAuthCoordinator;
  setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
  syncSnapshot: (
    cwd?: string,
    options?: {
      config?: McpConfigDocument;
      metadataCache?: McpMetadataCacheDocument;
      rawConfigUpdatedAt?: string | null;
    },
  ) => Promise<SyncedRuntimeState>;
}): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }

  await options.authCoordinator.cancelAuth(serverName);
  options.setRuntimeStatus(serverName, {
    connectionStatus: 'needs-auth',
    authStatus: 'not-authenticated',
  });
  const synced = await options.syncSnapshot(options.cwd);
  return createToolResult(`Cancelled authentication for MCP server "${serverName}".`, {
    snapshotWritten: true,
    serverName,
    authStatus: synced.snapshot.servers.find((server) => server.serverName === serverName)?.authStatus ?? 'not-authenticated',
  });
}

async function reconnectAuthenticatedServer(
  options: {
    cwd?: string;
    serverName?: string;
    authCoordinator?: McpOAuthCoordinator;
    manager: McpServerManager;
    setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
    syncSnapshot: (
      cwd?: string,
      options?: {
        config?: McpConfigDocument;
        metadataCache?: McpMetadataCacheDocument;
        rawConfigUpdatedAt?: string | null;
      },
    ) => Promise<SyncedRuntimeState>;
  },
  synced: SyncedRuntimeState,
  serverName: string,
): Promise<SyncedRuntimeState> {
  const serverConfig = synced.config.mcpServers[serverName];
  const connection = await options.manager.reconnect(serverName, serverConfig);
  const metadataCache = await readMetadataCache();
  const { nextCache, runtimeStatus } = await reconcileConnection({
    serverName,
    serverConfig,
    metadataCache,
    connection,
  });
  options.setRuntimeStatus(serverName, runtimeStatus);
  return options.syncSnapshot(options.cwd, { config: synced.config, metadataCache: nextCache });
}
