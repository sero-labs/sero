export type McpToolPrefix = 'server' | 'short' | 'none';
export type McpTransport = 'stdio' | 'http';
export type McpLifecycle = 'lazy' | 'eager' | 'keep-alive';
export type McpConnectionStatus = 'disabled' | 'idle' | 'connecting' | 'connected' | 'needs-auth' | 'error';
export type McpAuthStatus = 'not-required' | 'not-authenticated' | 'authenticating' | 'authenticated' | 'expired' | 'error';
export type McpAuthMode = 'none' | 'oauth' | 'bearer';

export interface McpResourceSummary {
  uri: string;
  name: string;
  description?: string;
}

export interface McpUiToolSummary {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpServerSnapshot {
  serverName: string;
  enabled: boolean;
  transport: McpTransport;
  lifecycle: McpLifecycle;
  authMode: McpAuthMode;
  connectionStatus: McpConnectionStatus;
  authStatus: McpAuthStatus;
  toolCount: number;
  resourceCount: number;
  uiToolCount: number;
  command?: string;
  argsText?: string;
  cwd?: string;
  url?: string;
  bearerTokenEnv?: string;
  exposeResources?: boolean;
  debug?: boolean;
  lastError?: string;
  lastConnectedAt?: string | null;
  lastFailedAt?: string | null;
  resources: McpResourceSummary[];
  uiTools: McpUiToolSummary[];
}

export interface McpSummary {
  totalServers: number;
  enabledServers: number;
  connectedServers: number;
  needsAuthServers: number;
  errorServers: number;
}

export interface McpSettingsSnapshot {
  idleTimeout: number;
  toolPrefix: McpToolPrefix;
}

export interface McpAppState {
  initialized: boolean;
  firstRun: boolean;
  configPath: string | null;
  rawConfigUpdatedAt: string | null;
  servers: McpServerSnapshot[];
  settings: McpSettingsSnapshot;
  lastRefreshedAt: string | null;
  summary: McpSummary;
}

export interface McpServerEditorInput {
  originalServerName?: string;
  serverName: string;
  enabled: boolean;
  transport: McpTransport;
  lifecycle: McpLifecycle;
  authMode: McpAuthMode;
  command: string;
  argsText: string;
  cwd: string;
  url: string;
  bearerTokenEnv: string;
  exposeResources: boolean;
  debug: boolean;
}

export const DEFAULT_MCP_SETTINGS: McpSettingsSnapshot = {
  idleTimeout: 10,
  toolPrefix: 'server',
};

export const EMPTY_MCP_SUMMARY: McpSummary = {
  totalServers: 0,
  enabledServers: 0,
  connectedServers: 0,
  needsAuthServers: 0,
  errorServers: 0,
};

export function createDefaultMcpState(): McpAppState {
  return {
    initialized: false,
    firstRun: true,
    configPath: null,
    rawConfigUpdatedAt: null,
    servers: [],
    settings: { ...DEFAULT_MCP_SETTINGS },
    lastRefreshedAt: null,
    summary: { ...EMPTY_MCP_SUMMARY },
  };
}

export function createEmptyServerEditorInput(): McpServerEditorInput {
  return {
    originalServerName: undefined,
    serverName: '',
    enabled: true,
    transport: 'stdio',
    lifecycle: 'lazy',
    authMode: 'none',
    command: '',
    argsText: '',
    cwd: '',
    url: '',
    bearerTokenEnv: '',
    exposeResources: true,
    debug: false,
  };
}

export function createServerEditorInputFromSnapshot(server: McpServerSnapshot): McpServerEditorInput {
  return {
    ...createEmptyServerEditorInput(),
    originalServerName: server.serverName,
    serverName: server.serverName,
    enabled: server.enabled,
    transport: server.transport,
    lifecycle: server.lifecycle,
    authMode: server.authMode,
    command: server.command ?? '',
    argsText: server.argsText ?? '',
    cwd: server.cwd ?? '',
    url: server.url ?? '',
    bearerTokenEnv: server.bearerTokenEnv ?? '',
    exposeResources: server.exposeResources ?? true,
    debug: server.debug ?? false,
  };
}

export const DEFAULT_MCP_STATE = createDefaultMcpState();
