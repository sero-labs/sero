import { computeServerHash } from '../cache/metadata-cache';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import type { ManagedConnection } from '../manager/types';

export const KEEP_ALIVE_HEALTHCHECK_INTERVAL_MS = 30_000;

type OAuthTokenChecker = (serverName: string) => Promise<boolean>;

export function getAutoConnectServerEntries(config: McpConfigDocument): Array<[string, McpServerConfig]> {
  return Object.entries(config.mcpServers).filter(([, serverConfig]) => {
    return serverConfig.enabled !== false && serverConfig.lifecycle !== 'lazy';
  });
}

export function getKeepAliveServerEntries(config: McpConfigDocument): Array<[string, McpServerConfig]> {
  return Object.entries(config.mcpServers).filter(([, serverConfig]) => {
    return serverConfig.enabled !== false && serverConfig.lifecycle === 'keep-alive';
  });
}

export async function shouldAttemptAutoConnect(options: {
  serverName: string;
  serverConfig: McpServerConfig;
  connection?: ManagedConnection;
  hasOAuthTokens: OAuthTokenChecker;
}): Promise<boolean> {
  const { serverName, serverConfig, connection, hasOAuthTokens } = options;

  if (serverConfig.enabled === false || serverConfig.lifecycle === 'lazy') {
    return false;
  }

  if (connection?.status === 'connected') {
    return false;
  }

  if (serverConfig.auth === 'oauth') {
    return hasOAuthTokens(serverName);
  }

  if (serverConfig.auth === 'bearer') {
    return Boolean(serverConfig.bearerToken || (serverConfig.bearerTokenEnv && process.env[serverConfig.bearerTokenEnv]));
  }

  return true;
}

export function getChangedServerNames(
  previousConfig: McpConfigDocument,
  nextConfig: McpConfigDocument,
): string[] {
  const changed = new Set<string>();

  for (const [serverName, previousServer] of Object.entries(previousConfig.mcpServers)) {
    const nextServer = nextConfig.mcpServers[serverName];
    if (!nextServer) {
      changed.add(serverName);
      continue;
    }
    if (computeServerHash(previousServer) !== computeServerHash(nextServer)) {
      changed.add(serverName);
    }
  }

  return [...changed];
}
