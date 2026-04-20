import type { McpServerEditorInput } from '../../shared/types';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { ensureOAuthDir, hasOAuthTokens } from '../auth/storage';
import { readMetadataCache, writeMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import { ensureConfigFile, getConfigUpdatedAt, normalizeConfigDocument, readRawConfig, writeConfig } from '../config/io';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import { buildSnapshot } from '../state/snapshot';
import { getMcpConfigPath, getMcpStatePath } from '../state/paths';
import { writeState } from '../state/state-io';
import { createToolResult, type ManagerAction, type ProxyAction, type ToolResult } from '../tools/types';

export interface McpRuntime {
  attachPi(pi: ExtensionAPI): void;
  handleSessionStart(ctx: { cwd: string }): Promise<void>;
  handleSessionSwitch(ctx: { cwd: string }): Promise<void>;
  handleSessionShutdown(): Promise<void>;
  executeManagerAction(
    action: ManagerAction,
    options?: { cwd?: string; rawConfig?: string; serverName?: string; serverInput?: McpServerEditorInput },
  ): Promise<ToolResult>;
  executeProxyAction(action: ProxyAction, options?: { cwd?: string }): Promise<ToolResult>;
}

interface SyncedRuntimeState {
  configPath: string;
  statePath: string;
  config: McpConfigDocument;
  metadataCache: McpMetadataCacheDocument;
  rawConfigUpdatedAt: string | null;
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>;
}

let runtimeSingleton: McpRuntime | null = null;

export function getMcpRuntime(): McpRuntime {
  runtimeSingleton ??= createMcpRuntime();
  return runtimeSingleton;
}

function createMcpRuntime(): McpRuntime {
  let attachedPi: ExtensionAPI | null = null;
  let lastKnownCwd = '';
  let sessionRefCount = 0;
  let lastState: SyncedRuntimeState | null = null;

  function attachPi(pi: ExtensionAPI): void {
    attachedPi = pi;
  }

  async function handleSessionStart(ctx: { cwd: string }): Promise<void> {
    sessionRefCount += 1;
    await syncSnapshot(ctx.cwd);
  }

  async function handleSessionSwitch(ctx: { cwd: string }): Promise<void> {
    await syncSnapshot(ctx.cwd);
  }

  async function handleSessionShutdown(): Promise<void> {
    sessionRefCount = Math.max(0, sessionRefCount - 1);
    if (sessionRefCount === 0) {
      lastState = null;
    }
  }

  async function executeManagerAction(
    action: ManagerAction,
    options: { cwd?: string; rawConfig?: string; serverName?: string; serverInput?: McpServerEditorInput } = {},
  ): Promise<ToolResult> {
    switch (action) {
      case 'save_raw_config':
        return saveRawConfig(options.cwd, options.rawConfig);
      case 'upsert_server':
        return upsertServer(options.cwd, options.serverInput);
      case 'remove_server':
        return removeServer(options.cwd, options.serverName);
      case 'enable_server':
        return toggleServer(options.cwd, options.serverName, true);
      case 'disable_server':
        return toggleServer(options.cwd, options.serverName, false);
      default:
        break;
    }

    const synced = await syncSnapshot(options.cwd);

    if (action === 'get_raw_config') {
      const rawConfig = await readRawConfig(synced.configPath);
      return createToolResult(rawConfig.trim() || '{}', {
        snapshotWritten: true,
        configPath: synced.configPath,
        statePath: synced.statePath,
        rawConfig,
      });
    }

    if (action === 'get_diagnostics') {
      return createToolResult(formatDiagnostics(synced, sessionRefCount, !!attachedPi), {
        snapshotWritten: true,
        configPath: synced.configPath,
        statePath: synced.statePath,
        metadataCache: synced.metadataCache,
      });
    }

    const prefix = action === 'refresh' ? 'Refreshed' : 'Initialized';
    return createToolResult(`${prefix} MCP app state for ${synced.snapshot.summary.totalServers} configured server(s).`, {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      serverCount: synced.snapshot.summary.totalServers,
    });
  }

  async function executeProxyAction(action: ProxyAction, options: { cwd?: string } = {}): Promise<ToolResult> {
    const synced = await syncSnapshot(options.cwd);
    if (action === 'list') {
      return createToolResult(formatServerList(synced.snapshot.servers), {
        mode: 'list',
        serverCount: synced.snapshot.summary.totalServers,
      });
    }

    return createToolResult(formatStatusSummary(synced.snapshot), {
      mode: 'status',
      serverCount: synced.snapshot.summary.totalServers,
    });
  }

  async function saveRawConfig(cwd: string | undefined, rawConfigInput?: string): Promise<ToolResult> {
    if (!rawConfigInput?.trim()) {
      return createToolResult('Error: Raw config cannot be empty.', { snapshotWritten: false });
    }

    try {
      const parsed = JSON.parse(rawConfigInput);
      const normalized = normalizeConfigDocument(parsed);
      const configPath = getMcpConfigPath();
      await writeConfig(normalized, configPath);
      const synced = await syncSnapshot(cwd);
      return createToolResult(`Saved MCP config with ${synced.snapshot.summary.totalServers} configured server(s).`, {
        snapshotWritten: true,
        configPath: synced.configPath,
        statePath: synced.statePath,
        rawConfig: `${JSON.stringify(normalized, null, 2)}\n`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createToolResult(`Error: Failed to save raw MCP config. ${message}`, {
        snapshotWritten: false,
      });
    }
  }

  async function upsertServer(cwd: string | undefined, serverInput?: McpServerEditorInput): Promise<ToolResult> {
    if (!serverInput?.serverName.trim()) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }

    const synced = await mutateConfig(cwd, (config) => {
      const nextServers = { ...config.mcpServers };
      const originalName = serverInput.originalServerName?.trim();
      const nextName = serverInput.serverName.trim();
      const existing = originalName ? nextServers[originalName] : nextServers[nextName];

      if (originalName && originalName !== nextName) {
        delete nextServers[originalName];
      }

      nextServers[nextName] = buildServerConfig(serverInput, existing);
      config.mcpServers = nextServers;
    });

    return createToolResult(`Saved MCP server "${serverInput.serverName.trim()}".`, {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      serverCount: synced.snapshot.summary.totalServers,
    });
  }

  async function removeServer(cwd: string | undefined, serverName?: string): Promise<ToolResult> {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }

    const synced = await mutateConfig(cwd, (config) => {
      const nextServers = { ...config.mcpServers };
      delete nextServers[normalizedServerName];
      config.mcpServers = nextServers;
    });

    return createToolResult(`Removed MCP server "${normalizedServerName}".`, {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      serverCount: synced.snapshot.summary.totalServers,
    });
  }

  async function toggleServer(cwd: string | undefined, serverName: string | undefined, enabled: boolean): Promise<ToolResult> {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }

    const synced = await mutateConfig(cwd, (config) => {
      const current = config.mcpServers[normalizedServerName];
      if (!current) {
        throw new Error(`Server "${normalizedServerName}" does not exist.`);
      }
      config.mcpServers = {
        ...config.mcpServers,
        [normalizedServerName]: {
          ...current,
          enabled,
        },
      };
    });

    return createToolResult(`${enabled ? 'Enabled' : 'Disabled'} MCP server "${normalizedServerName}".`, {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      serverCount: synced.snapshot.summary.totalServers,
    });
  }

  async function mutateConfig(
    cwd: string | undefined,
    mutate: (config: McpConfigDocument) => void,
  ): Promise<SyncedRuntimeState> {
    const configPath = getMcpConfigPath();
    const config = await ensureConfigFile(configPath);
    const nextConfig: McpConfigDocument = {
      ...config,
      mcpServers: { ...config.mcpServers },
    };
    mutate(nextConfig);
    await writeConfig(nextConfig, configPath);
    return syncSnapshot(cwd);
  }

  async function syncSnapshot(cwd?: string): Promise<SyncedRuntimeState> {
    if (cwd) {
      lastKnownCwd = cwd;
    }

    const resolvedCwd = lastKnownCwd || cwd || process.cwd();
    const configPath = getMcpConfigPath();
    const statePath = getMcpStatePath(resolvedCwd);
    const [config, rawConfigUpdatedAt, metadataCache] = await Promise.all([
      ensureConfigFile(configPath),
      getConfigUpdatedAt(configPath),
      readMetadataCache(),
      ensureOAuthDir(),
    ]);

    await writeMetadataCache(metadataCache);

    const snapshot = await buildSnapshot({
      configPath,
      rawConfigUpdatedAt,
      config,
      metadataCache,
      hasOAuthTokens,
    });

    await writeState(snapshot, statePath);
    lastState = { configPath, statePath, config, metadataCache, rawConfigUpdatedAt, snapshot };
    return lastState;
  }

  return {
    attachPi,
    handleSessionStart,
    handleSessionSwitch,
    handleSessionShutdown,
    executeManagerAction,
    executeProxyAction,
  };
}

function buildServerConfig(input: McpServerEditorInput, existing?: McpServerConfig): McpServerConfig {
  const next: McpServerConfig = { ...(existing ?? {}) };
  next.enabled = input.enabled;
  next.lifecycle = input.lifecycle;
  next.exposeResources = input.exposeResources;
  next.debug = input.debug;

  const cwd = input.cwd.trim();
  if (cwd) next.cwd = cwd;
  else delete next.cwd;

  if (input.transport === 'stdio') {
    const command = input.command.trim();
    if (command) next.command = command;
    else delete next.command;

    const args = parseArgsText(input.argsText);
    if (args.length > 0) next.args = args;
    else delete next.args;

    delete next.url;
  } else {
    const url = input.url.trim();
    if (url) next.url = url;
    else delete next.url;

    delete next.command;
    delete next.args;
  }

  switch (input.authMode) {
    case 'oauth':
      next.auth = 'oauth';
      delete next.bearerToken;
      delete next.bearerTokenEnv;
      break;
    case 'bearer': {
      next.auth = 'bearer';
      delete next.oauth;
      const bearerTokenEnv = input.bearerTokenEnv.trim();
      if (bearerTokenEnv) next.bearerTokenEnv = bearerTokenEnv;
      else delete next.bearerTokenEnv;
      break;
    }
    default:
      next.auth = false;
      delete next.bearerToken;
      delete next.bearerTokenEnv;
      delete next.oauth;
      break;
  }

  return next;
}

function parseArgsText(argsText: string): string[] {
  return argsText
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatStatusSummary(snapshot: SyncedRuntimeState['snapshot']): string {
  const lines = [
    `MCP status: ${snapshot.summary.totalServers} server(s) configured`,
    `Enabled: ${snapshot.summary.enabledServers}`,
    `Connected: ${snapshot.summary.connectedServers}`,
    `Needs auth: ${snapshot.summary.needsAuthServers}`,
    `Errors: ${snapshot.summary.errorServers}`,
  ];

  if (snapshot.servers.length === 0) {
    lines.push('', 'Open the MCP app in Sero to add your first MCP server.');
  }

  return lines.join('\n');
}

function formatServerList(snapshotServers: SyncedRuntimeState['snapshot']['servers']): string {
  if (snapshotServers.length === 0) {
    return 'No MCP servers are configured yet. Open the MCP app in Sero to add one.';
  }

  return snapshotServers
    .map((server) => {
      const enabledLabel = server.enabled ? 'enabled' : 'disabled';
      return `- ${server.serverName} (${enabledLabel}, ${server.connectionStatus}, ${server.authStatus})`;
    })
    .join('\n');
}

function formatDiagnostics(state: SyncedRuntimeState, sessionRefCount: number, hasAttachedPi: boolean): string {
  const lines = [
    `Config: ${state.configPath}`,
    `State: ${state.statePath}`,
    `Raw config updated: ${state.rawConfigUpdatedAt ?? 'never'}`,
    `Servers: ${state.snapshot.summary.totalServers}`,
  ];

  for (const server of state.snapshot.servers) {
    lines.push(
      `- ${server.serverName}: ${server.transport}, ${server.lifecycle}, ${server.connectionStatus}, ${server.authStatus}, tools=${server.toolCount}, resources=${server.resourceCount}`,
    );
  }

  lines.push(`Runtime sessions: ${sessionRefCount}`);
  if (hasAttachedPi) {
    lines.push('Runtime: attached to active Pi extension instance');
  }

  return lines.join('\n');
}
