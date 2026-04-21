import {
  computeServerHash,
  setMetadataCacheEntry,
  writeMetadataCache,
  type McpMetadataCacheDocument,
} from '../cache/metadata-cache';
import type { McpServerConfig } from '../config/types';
import { buildMetadataCacheEntry } from '../manager/tool-metadata';
import type { ManagedConnection } from '../manager/types';
import type { RuntimeServerStatus } from '../state/snapshot';

export async function reconcileConnection(options: {
  serverName: string;
  serverConfig: McpServerConfig;
  metadataCache: McpMetadataCacheDocument;
  connection: ManagedConnection;
}): Promise<{ nextCache: McpMetadataCacheDocument; runtimeStatus: RuntimeServerStatus }> {
  const { serverName, serverConfig, metadataCache, connection } = options;

  if (connection.status === 'connected') {
    const nextCache = setMetadataCacheEntry(
      metadataCache,
      serverName,
      buildMetadataCacheEntry({
        configHash: computeServerHash(serverConfig),
        tools: connection.tools,
        resources: connection.resources,
      }),
    );
    await writeMetadataCache(nextCache);
    return {
      nextCache,
      runtimeStatus: {
        connectionStatus: 'connected',
        authStatus: resolveConnectedAuthStatus(serverConfig),
        lastConnectedAt: connection.lastConnectedAt ?? new Date().toISOString(),
        lastFailedAt: null,
      },
    };
  }

  if (connection.status === 'needs-auth') {
    await writeMetadataCache(metadataCache);
    return {
      nextCache: metadataCache,
      runtimeStatus: {
        connectionStatus: 'needs-auth',
        authStatus: 'not-authenticated',
        lastError: connection.lastError,
        lastConnectedAt: null,
        lastFailedAt: connection.lastFailedAt ?? new Date().toISOString(),
      },
    };
  }

  await writeMetadataCache(metadataCache);
  return {
    nextCache: metadataCache,
    runtimeStatus: {
      connectionStatus: 'error',
      authStatus: serverConfig.auth ? 'error' : 'not-required',
      lastError: connection.lastError,
      lastConnectedAt: null,
      lastFailedAt: connection.lastFailedAt ?? new Date().toISOString(),
    },
  };
}

export function formatConnectMessage(
  serverName: string,
  status: ManagedConnection['status'],
  options: {
    reconnect?: boolean;
    alreadyConnected?: boolean;
  } = {},
): string {
  switch (status) {
    case 'connected':
      if (options.alreadyConnected) {
        return `MCP server "${serverName}" is already connected.`;
      }
      return options.reconnect
        ? `Reconnected MCP server "${serverName}".`
        : `Connected MCP server "${serverName}".`;
    case 'needs-auth':
      return `Server "${serverName}" needs authentication before it can connect.`;
    case 'error':
      return options.reconnect
        ? `Server "${serverName}" failed to reconnect.`
        : `Server "${serverName}" failed to connect.`;
    default:
      return `Server "${serverName}" is closed.`;
  }
}

function resolveConnectedAuthStatus(serverConfig: McpServerConfig) {
  if (serverConfig.auth === 'oauth' || serverConfig.auth === 'bearer') {
    return 'authenticated' as const;
  }
  return 'not-required' as const;
}
