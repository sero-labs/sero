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
