import { readMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import { normalizeConfigDocument } from '../config/io';
import type { McpConfigDocument } from '../config/types';
import { McpServerManager } from '../manager/server-manager';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ToolResult } from '../tools/types';
import { formatConnectMessage, reconcileConnection } from './runtime-connect';
import type { SyncedRuntimeState } from './runtime-types';

export async function saveRawConfigAction(options: {
  cwd?: string;
  rawConfigInput?: string;
  writeConfigAndSyncSnapshot: (
    cwd: string | undefined,
    config: McpConfigDocument,
    metadataCacheOverride?: McpMetadataCacheDocument,
  ) => Promise<SyncedRuntimeState>;
}): Promise<ToolResult> {
  if (!options.rawConfigInput?.trim()) {
    return createToolResult('Error: Raw config cannot be empty.', { snapshotWritten: false });
  }

  try {
    const normalized = normalizeConfigDocument(JSON.parse(options.rawConfigInput));
    const synced = await options.writeConfigAndSyncSnapshot(options.cwd, normalized);
    return createToolResult(
      `Saved MCP config with ${synced.snapshot.summary.totalServers} configured server(s).`,
      {
        snapshotWritten: true,
        configPath: synced.configPath,
        statePath: synced.statePath,
        rawConfig: `${JSON.stringify(normalized, null, 2)}\n`,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolResult(`Error: Failed to save raw MCP config. ${message}`, {
      snapshotWritten: false,
    });
  }
}

export async function connectServerAction(options: {
  cwd?: string;
  serverName?: string;
  reconnect: boolean;
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
  const normalizedServerName = options.serverName?.trim();
  if (!normalizedServerName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }

  const synced = await options.syncSnapshot(options.cwd);
  const serverConfig = synced.config.mcpServers[normalizedServerName];
  if (!serverConfig) {
    return createToolResult(`Error: Server "${normalizedServerName}" does not exist.`, { snapshotWritten: false });
  }
  if (serverConfig.enabled === false) {
    return createToolResult(`Error: Server "${normalizedServerName}" is disabled. Enable it before connecting.`, { snapshotWritten: false });
  }

  const connection = options.reconnect
    ? await options.manager.reconnect(normalizedServerName, serverConfig)
    : await options.manager.connect(normalizedServerName, serverConfig);

  const metadataCache = await readMetadataCache();
  const { nextCache, runtimeStatus } = await reconcileConnection({
    serverName: normalizedServerName,
    serverConfig,
    metadataCache,
    connection,
  });
  options.setRuntimeStatus(normalizedServerName, runtimeStatus);

  const nextState = await options.syncSnapshot(options.cwd, {
    config: synced.config,
    metadataCache: nextCache,
  });
  const nextServer = nextState.snapshot.servers.find((server) => server.serverName === normalizedServerName);

  return createToolResult(formatConnectMessage(normalizedServerName, connection.status), {
    snapshotWritten: true,
    configPath: nextState.configPath,
    statePath: nextState.statePath,
    connectionStatus: runtimeStatus.connectionStatus,
    authStatus: runtimeStatus.authStatus,
    toolCount: nextServer?.toolCount ?? 0,
    resourceCount: nextServer?.resourceCount ?? 0,
    lastError: runtimeStatus.lastError ?? null,
  });
}
