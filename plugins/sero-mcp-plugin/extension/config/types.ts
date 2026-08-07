import type { McpLifecycle, McpToolPrefix } from '../../shared/types';
import { DEFAULT_MCP_SETTINGS } from '../../shared/types';

export interface McpOAuthConfig extends Record<string, unknown> {
  grantType?: 'authorization_code' | 'client_credentials';
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

export interface McpServerConfig extends Record<string, unknown> {
  enabled?: boolean;
  transport?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth?: 'oauth' | 'bearer' | false;
  bearerToken?: string;
  bearerTokenEnv?: string;
  oauth?: McpOAuthConfig | false;
  lifecycle?: McpLifecycle;
  idleTimeout?: number;
  exposeResources?: boolean;
  excludeTools?: string[];
  debug?: boolean;
  portableTransport?: 'stdio' | 'streamable-http' | 'sse';
  literalEnv?: boolean;
  managedByAgentPlugin?: {
    pluginId: string;
    pluginName: string;
    serverName: string;
  };
}

export interface McpConfigSettings extends Record<string, unknown> {
  idleTimeout?: number;
  toolPrefix?: McpToolPrefix;
}

export interface McpConfigDocument extends Record<string, unknown> {
  settings?: McpConfigSettings;
  mcpServers: Record<string, McpServerConfig>;
}

export function createDefaultMcpConfig(): McpConfigDocument {
  return {
    settings: { ...DEFAULT_MCP_SETTINGS },
    mcpServers: {},
  };
}

export function isResourceExposureEnabled(serverConfig: McpServerConfig): boolean {
  return serverConfig.exposeResources !== false;
}

export function resolveBearerTokenValue(serverConfig: McpServerConfig): string | undefined {
  if (typeof serverConfig.bearerToken === 'string' && serverConfig.bearerToken.length > 0) {
    return serverConfig.bearerToken;
  }

  const envName = serverConfig.bearerTokenEnv?.trim();
  if (!envName) {
    return undefined;
  }

  const envValue = process.env[envName];
  return typeof envValue === 'string' && envValue.length > 0 ? envValue : undefined;
}

export function hasBearerTokenValue(serverConfig: McpServerConfig): boolean {
  return !!resolveBearerTokenValue(serverConfig);
}
