import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { McpAppState, McpAuthStatus, McpConnectionStatus, McpServerSnapshot } from '../../shared/types';
import { createDefaultMcpState, EMPTY_MCP_SUMMARY } from '../../shared/types';
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
    authMode: normalizeAuthMode(value.authMode),
    connectionStatus: normalizeConnectionStatus(value.connectionStatus),
    authStatus: normalizeAuthStatus(value.authStatus),
    toolCount: typeof value.toolCount === 'number' ? value.toolCount : 0,
    resourceCount: typeof value.resourceCount === 'number' ? value.resourceCount : 0,
    uiToolCount: typeof value.uiToolCount === 'number' ? value.uiToolCount : 0,
    command: typeof value.command === 'string' ? value.command : undefined,
    argsText: typeof value.argsText === 'string' ? value.argsText : undefined,
    cwd: typeof value.cwd === 'string' ? value.cwd : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
    bearerTokenEnv: typeof value.bearerTokenEnv === 'string' ? value.bearerTokenEnv : undefined,
    exposeResources: typeof value.exposeResources === 'boolean' ? value.exposeResources : true,
    debug: typeof value.debug === 'boolean' ? value.debug : false,
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
      resourceUri: typeof tool.resourceUri === 'string' ? tool.resourceUri : '',
    })).filter((tool) => tool.name.length > 0 && tool.resourceUri.length > 0) : [],
    source: value.source === 'agent-plugin' ? 'agent-plugin' : 'user',
    managedByAgentPlugin: normalizeAgentPluginOwner(value.managedByAgentPlugin),
  };
}

function normalizeAgentPluginOwner(value: unknown): McpServerSnapshot['managedByAgentPlugin'] {
  if (!isRecord(value)) return undefined;
  if (typeof value.pluginId !== 'string' || typeof value.pluginName !== 'string' || typeof value.serverName !== 'string') {
    return undefined;
  }
  return {
    pluginId: value.pluginId,
    pluginName: value.pluginName,
    serverName: value.serverName,
  };
}

function normalizeAuthMode(value: unknown): 'none' | 'oauth' | 'bearer' {
  switch (value) {
    case 'oauth':
    case 'bearer':
      return value;
    default:
      return 'none';
  }
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
