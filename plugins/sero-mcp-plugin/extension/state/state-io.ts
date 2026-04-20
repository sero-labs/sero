import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { McpAppState, McpAuthStatus, McpConnectionStatus, McpServerSnapshot } from '../../shared/types';
import { createDefaultMcpState, EMPTY_MCP_SUMMARY } from '../../shared/types';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import { getMcpStatePath } from './paths';

const stateWriteQueues = new Map<string, Promise<void>>();

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeServerSnapshot(value: unknown): McpServerSnapshot | null {
  if (!isRecord(value) || typeof value.serverName !== 'string') return null;
  return {
    serverName: value.serverName,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    transport: value.transport === 'http' ? 'http' : 'stdio',
    lifecycle:
      value.lifecycle === 'eager' || value.lifecycle === 'keep-alive' ? value.lifecycle : 'lazy',
    connectionStatus: normalizeConnectionStatus(value.connectionStatus),
    authStatus: normalizeAuthStatus(value.authStatus),
    toolCount: typeof value.toolCount === 'number' ? value.toolCount : 0,
    resourceCount: typeof value.resourceCount === 'number' ? value.resourceCount : 0,
    uiToolCount: typeof value.uiToolCount === 'number' ? value.uiToolCount : 0,
    lastError: typeof value.lastError === 'string' ? value.lastError : undefined,
    lastConnectedAt: typeof value.lastConnectedAt === 'string' ? value.lastConnectedAt : null,
    lastFailedAt: typeof value.lastFailedAt === 'string' ? value.lastFailedAt : null,
    resources: Array.isArray(value.resources) ? value.resources.filter(isRecord).map((resource) => ({
      uri: typeof resource.uri === 'string' ? resource.uri : '',
      name: typeof resource.name === 'string' ? resource.name : 'Resource',
      description: typeof resource.description === 'string' ? resource.description : undefined,
    })).filter((resource) => resource.uri.length > 0) : [],
    uiTools: Array.isArray(value.uiTools) ? value.uiTools.filter(isRecord).map((tool) => ({
      name: typeof tool.name === 'string' ? tool.name : '',
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.inputSchema,
    })).filter((tool) => tool.name.length > 0) : [],
  };
}

function normalizeConnectionStatus(value: unknown): McpConnectionStatus {
  switch (value) {
    case 'disabled':
    case 'idle':
    case 'connecting':
    case 'connected':
    case 'needs-auth':
    case 'error':
      return value;
    default:
      return 'idle';
  }
}

function normalizeAuthStatus(value: unknown): McpAuthStatus {
  switch (value) {
    case 'not-required':
    case 'not-authenticated':
    case 'authenticating':
    case 'authenticated':
    case 'expired':
    case 'error':
      return value;
    default:
      return 'not-required';
  }
}

export function normalizeState(raw: unknown): McpAppState {
  const defaults = createDefaultMcpState();
  if (!isRecord(raw)) return defaults;

  const servers = Array.isArray(raw.servers)
    ? raw.servers.map(normalizeServerSnapshot).filter((server): server is McpServerSnapshot => !!server)
    : [];

  return {
    initialized: typeof raw.initialized === 'boolean' ? raw.initialized : defaults.initialized,
    firstRun: typeof raw.firstRun === 'boolean' ? raw.firstRun : servers.length === 0,
    configPath: typeof raw.configPath === 'string' ? raw.configPath : defaults.configPath,
    rawConfigUpdatedAt: typeof raw.rawConfigUpdatedAt === 'string' ? raw.rawConfigUpdatedAt : defaults.rawConfigUpdatedAt,
    servers,
    settings: {
      idleTimeout:
        isRecord(raw.settings) && typeof raw.settings.idleTimeout === 'number'
          ? raw.settings.idleTimeout
          : defaults.settings.idleTimeout,
      toolPrefix:
        isRecord(raw.settings) && (raw.settings.toolPrefix === 'server' || raw.settings.toolPrefix === 'short' || raw.settings.toolPrefix === 'none')
          ? raw.settings.toolPrefix
          : defaults.settings.toolPrefix,
    },
    lastRefreshedAt: typeof raw.lastRefreshedAt === 'string' ? raw.lastRefreshedAt : defaults.lastRefreshedAt,
    summary: isRecord(raw.summary)
      ? {
          totalServers: typeof raw.summary.totalServers === 'number' ? raw.summary.totalServers : 0,
          enabledServers: typeof raw.summary.enabledServers === 'number' ? raw.summary.enabledServers : 0,
          connectedServers: typeof raw.summary.connectedServers === 'number' ? raw.summary.connectedServers : 0,
          needsAuthServers: typeof raw.summary.needsAuthServers === 'number' ? raw.summary.needsAuthServers : 0,
          errorServers: typeof raw.summary.errorServers === 'number' ? raw.summary.errorServers : 0,
        }
      : { ...EMPTY_MCP_SUMMARY },
  };
}

export async function readState(filePath = getMcpStatePath()): Promise<McpAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return createDefaultMcpState();
    }
    throw error;
  }
}

export async function writeState(state: McpAppState, filePath = getMcpStatePath()): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function updateState<T>(
  updater: (state: McpAppState) => Promise<T> | T,
  filePath = getMcpStatePath(),
): Promise<T> {
  const previous = stateWriteQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  stateWriteQueues.set(filePath, previous.then(() => current));

  await previous;
  try {
    const state = await readState(filePath);
    return await updater(state);
  } finally {
    release();
    if (stateWriteQueues.get(filePath) === current) {
      stateWriteQueues.delete(filePath);
    }
  }
}

export function createSnapshotFromConfig(
  configPath: string,
  config: McpConfigDocument,
  rawConfigUpdatedAt: string | null,
): McpAppState {
  const servers = Object.entries(config.mcpServers).map(([serverName, serverConfig]) => {
    return createServerSnapshot(serverName, serverConfig);
  });

  const enabledServers = servers.filter((server) => server.enabled).length;
  const connectedServers = servers.filter((server) => server.connectionStatus === 'connected').length;
  const needsAuthServers = servers.filter((server) => server.authStatus === 'not-authenticated').length;
  const errorServers = servers.filter((server) => server.connectionStatus === 'error' || server.authStatus === 'error').length;

  return {
    initialized: true,
    firstRun: servers.length === 0,
    configPath,
    rawConfigUpdatedAt,
    servers,
    settings: {
      idleTimeout: config.settings?.idleTimeout ?? 10,
      toolPrefix: config.settings?.toolPrefix ?? 'server',
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

function createServerSnapshot(serverName: string, serverConfig: McpServerConfig): McpServerSnapshot {
  const enabled = serverConfig.enabled !== false;
  return {
    serverName,
    enabled,
    transport: typeof serverConfig.url === 'string' && serverConfig.url.length > 0 ? 'http' : 'stdio',
    lifecycle: serverConfig.lifecycle ?? 'lazy',
    connectionStatus: enabled ? 'idle' : 'disabled',
    authStatus: resolveAuthStatus(serverConfig),
    toolCount: 0,
    resourceCount: 0,
    uiToolCount: 0,
    lastError: undefined,
    lastConnectedAt: null,
    lastFailedAt: null,
    resources: [],
    uiTools: [],
  };
}

function resolveAuthStatus(serverConfig: McpServerConfig): McpAuthStatus {
  if (serverConfig.auth === 'oauth' || serverConfig.auth === 'bearer') {
    return 'not-authenticated';
  }
  return 'not-required';
}
