import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { McpServerEditorInput } from '../../shared/types';
import { validateServerEditorInput } from '../../shared/types';
import { ensureOAuthDir, hasOAuthTokens } from '../auth/storage';
import { McpOAuthCoordinator } from '../auth/oauth-coordinator';
import { readMetadataCache, removeMetadataCacheEntry, writeMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import { ensureConfigFile, getConfigUpdatedAt, readRawConfig, writeConfig } from '../config/io';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import { McpServerManager } from '../manager/server-manager';
import { buildSnapshot, type RuntimeServerStatus } from '../state/snapshot';
import { getMcpConfigPath, getMcpStatePath } from '../state/paths';
import { connectServerAction, saveRawConfigAction } from './runtime-actions';
import {
  cancelServerAuthAction,
  clearServerAuthAction,
  completeServerAuthAction,
  startServerAuthAction,
} from './runtime-auth';
import { readServerResourceAction } from './runtime-resource';
import { executeProxyAction as executeProxyActionInternal } from './runtime-proxy';
import { reconcileConnection } from './runtime-connect';
import { createKeepAliveScheduler } from './runtime-keep-alive';
import {
  getAutoConnectServerEntries, getChangedServerNames, getKeepAliveServerEntries,
  KEEP_ALIVE_HEALTHCHECK_INTERVAL_MS, shouldAttemptAutoConnect,
} from './runtime-lifecycle';
import { writeState } from '../state/state-io';
import { createToolResult, type ManagerAction, type ProxyAction, type ToolResult } from '../tools/types';
import { buildServerConfig, formatDiagnostics, mutationErrorResult } from './runtime-utils';
import type { SyncedRuntimeState } from './runtime-types';
interface ManagerActionOptions {
  cwd?: string;
  rawConfig?: string;
  serverName?: string;
  resourceUri?: string;
  callbackUrl?: string;
  serverInput?: McpServerEditorInput;
}
interface SyncSnapshotOptions {
  config?: McpConfigDocument;
  rawConfigUpdatedAt?: string | null;
  metadataCache?: McpMetadataCacheDocument;
}
export interface McpRuntime {
  attachPi(pi: ExtensionAPI): void;
  handleSessionStart(ctx: { cwd: string }): Promise<void>;
  handleSessionSwitch(ctx: { cwd: string }): Promise<void>;
  handleSessionShutdown(): Promise<void>;
  executeManagerAction(action: ManagerAction, options?: ManagerActionOptions): Promise<ToolResult>;
  executeProxyAction(action: ProxyAction, options?: {
    cwd?: string; query?: string; serverName?: string; toolName?: string;
    toolArguments?: Record<string, unknown>; argumentsJson?: string;
  }): Promise<ToolResult>;
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
  let operationQueue: Promise<void> = Promise.resolve();
  const manager = new McpServerManager({ hasOAuthTokens });
  const authCoordinator = new McpOAuthCoordinator();
  const runtimeStatuses = new Map<string, RuntimeServerStatus>();
  const keepAliveScheduler = createKeepAliveScheduler({
    intervalMs: KEEP_ALIVE_HEALTHCHECK_INTERVAL_MS,
    isEnabled: () => sessionRefCount > 0,
    onTick: async () => {
      await runExclusive(async () => {
        const config = lastState?.config ?? await ensureConfigFile(getMcpConfigPath());
        await reconcileManagedServers(lastKnownCwd, config, 'keep-alive');
      });
    },
  });
  function attachPi(pi: ExtensionAPI): void { attachedPi = pi; }
  function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = operationQueue;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    operationQueue = previous.then(() => current);
    return previous.then(operation).finally(() => {
      release();
    });
  }
  function handleSessionStart(ctx: { cwd: string }): Promise<void> { return handleSessionActivation(ctx, true); }
  function handleSessionSwitch(ctx: { cwd: string }): Promise<void> { return handleSessionActivation(ctx, false); }
  function handleSessionActivation(ctx: { cwd: string }, incrementRefCount: boolean): Promise<void> {
    return runExclusive(async () => {
      if (incrementRefCount) {
        sessionRefCount += 1;
      }
      const synced = await syncSnapshot(ctx.cwd);
      keepAliveScheduler.start();
      await reconcileManagedServers(ctx.cwd, synced.config, 'startup');
    });
  }
  function handleSessionShutdown(): Promise<void> {
    return runExclusive(async () => {
      sessionRefCount = Math.max(0, sessionRefCount - 1);
      if (sessionRefCount === 0) {
        keepAliveScheduler.stop();
        await authCoordinator.cancelAll();
        await manager.closeAll();
        runtimeStatuses.clear();
        lastState = null;
      }
    });
  }
  function executeManagerAction(
    action: ManagerAction,
    options: ManagerActionOptions = {},
  ): Promise<ToolResult> {
    return runExclusive(async () => {
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
        case 'connect_server':
          return connectServer(options.cwd, options.serverName, false);
        case 'reconnect_server':
          return connectServer(options.cwd, options.serverName, true);
        case 'start_auth':
          return startServerAuth(options.cwd, options.serverName);
        case 'complete_auth':
          return completeServerAuth(options.cwd, options.serverName, options.callbackUrl);
        case 'cancel_auth':
          return cancelServerAuth(options.cwd, options.serverName);
        case 'clear_auth':
          return clearServerAuth(options.cwd, options.serverName);
        case 'read_resource':
          return readServerResource(options.cwd, options.serverName, options.resourceUri);
        default:
          break;
      }
      const synced = await syncSnapshot(options.cwd);
      if (action === 'bootstrap' || action === 'refresh') {
        keepAliveScheduler.start();
        const nextState = await reconcileManagedServers(options.cwd, synced.config, 'startup') ?? synced;
        const prefix = action === 'refresh' ? 'Refreshed' : 'Initialized';
        return createToolResult(
          `${prefix} MCP app state for ${nextState.snapshot.summary.totalServers} configured server(s).`,
          {
            snapshotWritten: true,
            configPath: nextState.configPath,
            statePath: nextState.statePath,
            serverCount: nextState.snapshot.summary.totalServers,
          },
        );
      }
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
        return createToolResult(formatDiagnostics({
          configPath: synced.configPath,
          statePath: synced.statePath,
          rawConfigUpdatedAt: synced.rawConfigUpdatedAt,
          snapshot: synced.snapshot,
          sessionRefCount,
          hasAttachedPi: !!attachedPi,
        }), {
          snapshotWritten: true,
          configPath: synced.configPath,
          statePath: synced.statePath,
          metadataCache: synced.metadataCache,
        });
      }
      return createToolResult(
        `Initialized MCP app state for ${synced.snapshot.summary.totalServers} configured server(s).`,
        {
          snapshotWritten: true,
          configPath: synced.configPath,
          statePath: synced.statePath,
          serverCount: synced.snapshot.summary.totalServers,
        },
      );
    });
  }
  function executeProxyAction(action: ProxyAction, options: {
    cwd?: string; query?: string; serverName?: string; toolName?: string;
    toolArguments?: Record<string, unknown>; argumentsJson?: string;
  } = {}): Promise<ToolResult> {
    return runExclusive(async () => executeProxyActionInternal({
      action,
      cwd: options.cwd,
      query: options.query,
      serverName: options.serverName,
      toolName: options.toolName,
      toolArguments: options.toolArguments,
      argumentsJson: options.argumentsJson,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    }));
  }
  async function saveRawConfig(cwd: string | undefined, rawConfigInput?: string): Promise<ToolResult> {
    return saveRawConfigAction({ cwd, rawConfigInput, writeConfigAndSyncSnapshot });
  }
  async function upsertServer(cwd: string | undefined, serverInput?: McpServerEditorInput): Promise<ToolResult> {
    if (!serverInput) {
      return createToolResult('Error: Server input is required.', { snapshotWritten: false });
    }
    const validationError = validateServerEditorInput(serverInput);
    if (validationError) {
      return createToolResult(`Error: ${validationError}`, { snapshotWritten: false });
    }
    try {
      const synced = await mutateConfig(cwd, (config) => {
        const nextServers = { ...config.mcpServers };
        const originalName = serverInput.originalServerName?.trim();
        const nextName = serverInput.serverName.trim();
        const hasRenameCollision = Boolean(
          originalName && originalName !== nextName && nextServers[nextName],
        );
        const hasCreateCollision = Boolean(!originalName && nextServers[nextName]);
        if (hasRenameCollision || hasCreateCollision) {
          throw new Error(`A server named "${nextName}" already exists.`);
        }
        const existing = originalName ? nextServers[originalName] : undefined;
        if (originalName && originalName !== nextName) {
          delete nextServers[originalName];
          runtimeStatuses.delete(originalName);
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
    } catch (error) {
      return mutationErrorResult(error);
    }
  }
  async function removeServer(cwd: string | undefined, serverName?: string): Promise<ToolResult> {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }
    try {
      await manager.close(normalizedServerName);
      runtimeStatuses.delete(normalizedServerName);
      const synced = await mutateConfig(cwd, (config) => {
        if (!config.mcpServers[normalizedServerName]) {
          throw new Error(`Server "${normalizedServerName}" does not exist.`);
        }
        const nextServers = { ...config.mcpServers };
        delete nextServers[normalizedServerName];
        config.mcpServers = nextServers;
      }, normalizedServerName);
      return createToolResult(`Removed MCP server "${normalizedServerName}".`, {
        snapshotWritten: true,
        configPath: synced.configPath,
        statePath: synced.statePath,
        serverCount: synced.snapshot.summary.totalServers,
      });
    } catch (error) {
      return mutationErrorResult(error);
    }
  }
  async function toggleServer(cwd: string | undefined, serverName: string | undefined, enabled: boolean): Promise<ToolResult> {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }
    try {
      if (!enabled) {
        await manager.close(normalizedServerName);
        runtimeStatuses.delete(normalizedServerName);
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
    } catch (error) {
      return mutationErrorResult(error);
    }
  }
  async function connectServer(
    cwd: string | undefined,
    serverName: string | undefined,
    reconnect: boolean,
  ): Promise<ToolResult> {
    return connectServerAction({
      cwd,
      serverName,
      reconnect,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function startServerAuth(cwd: string | undefined, serverName: string | undefined): Promise<ToolResult> {
    return startServerAuthAction({
      cwd,
      serverName,
      authCoordinator,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function completeServerAuth(
    cwd: string | undefined,
    serverName: string | undefined,
    callbackUrl: string | undefined,
  ): Promise<ToolResult> {
    return completeServerAuthAction({
      cwd,
      serverName,
      callbackUrl,
      authCoordinator,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function cancelServerAuth(cwd: string | undefined, serverName: string | undefined): Promise<ToolResult> {
    return cancelServerAuthAction({
      cwd,
      serverName,
      authCoordinator,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function clearServerAuth(cwd: string | undefined, serverName: string | undefined): Promise<ToolResult> {
    return clearServerAuthAction({
      cwd,
      serverName,
      authCoordinator,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function readServerResource(
    cwd: string | undefined,
    serverName: string | undefined,
    resourceUri: string | undefined,
  ): Promise<ToolResult> {
    return readServerResourceAction({
      cwd,
      serverName,
      resourceUri,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function reconcileManagedServers(
    cwd: string | undefined,
    config: McpConfigDocument,
    mode: 'startup' | 'keep-alive',
  ): Promise<SyncedRuntimeState | null> {
    const entries = mode === 'keep-alive'
      ? getKeepAliveServerEntries(config)
      : getAutoConnectServerEntries(config);
    if (entries.length === 0) {
      return null;
    }
    let nextCache: McpMetadataCacheDocument | null = null;
    let changed = false;
    for (const [serverName, serverConfig] of entries) {
      const shouldConnect = await shouldAttemptAutoConnect({
        serverName,
        serverConfig,
        connection: manager.getConnection(serverName),
        hasOAuthTokens,
      });
      if (!shouldConnect) {
        continue;
      }
      const connection = await manager.connect(serverName, serverConfig);
      const { nextCache: updatedCache, runtimeStatus } = await reconcileConnection({
        serverName,
        serverConfig,
        metadataCache: nextCache ?? await readMetadataCache(),
        connection,
      });
      runtimeStatuses.set(serverName, runtimeStatus);
      nextCache = updatedCache;
      changed = true;
    }
    if (!changed) {
      return null;
    }
    return syncSnapshot(cwd, { config, metadataCache: nextCache ?? await readMetadataCache() });
  }
  async function mutateConfig(
    cwd: string | undefined,
    mutate: (config: McpConfigDocument) => void,
    removeServerName?: string,
  ): Promise<SyncedRuntimeState> {
    const configPath = getMcpConfigPath();
    const config = await ensureConfigFile(configPath);
    const nextConfig: McpConfigDocument = {
      ...config,
      mcpServers: { ...config.mcpServers },
    };
    mutate(nextConfig);
    let metadataCache = await readMetadataCache();
    if (removeServerName) {
      metadataCache = removeMetadataCacheEntry(metadataCache, removeServerName);
      await writeMetadataCache(metadataCache);
    }
    return writeConfigAndSyncSnapshot(cwd, nextConfig, metadataCache);
  }
  async function writeConfigAndSyncSnapshot(
    cwd: string | undefined,
    config: McpConfigDocument,
    metadataCacheOverride?: McpMetadataCacheDocument,
  ): Promise<SyncedRuntimeState> {
    const configPath = getMcpConfigPath();
    const previousConfig = await ensureConfigFile(configPath);
    let metadataCache = metadataCacheOverride ?? await readMetadataCache();
    for (const serverName of getChangedServerNames(previousConfig, config)) {
      await manager.close(serverName);
      runtimeStatuses.delete(serverName);
      metadataCache = removeMetadataCacheEntry(metadataCache, serverName);
    }
    await writeConfig(config, configPath);
    const rawConfigUpdatedAt = await getConfigUpdatedAt(configPath);
    const synced = await syncSnapshot(cwd, { config, rawConfigUpdatedAt, metadataCache });
    return await reconcileManagedServers(cwd, config, 'startup') ?? synced;
  }
  async function syncSnapshot(
    cwd?: string,
    options: SyncSnapshotOptions = {},
  ): Promise<SyncedRuntimeState> {
    if (cwd) {
      lastKnownCwd = cwd;
    }
    const resolvedCwd = lastKnownCwd || cwd || process.cwd();
    const configPath = getMcpConfigPath();
    const statePath = getMcpStatePath(resolvedCwd);
    await ensureOAuthDir();
    const config = options.config ?? await ensureConfigFile(configPath);
    const rawConfigUpdatedAt = options.rawConfigUpdatedAt ?? await getConfigUpdatedAt(configPath);
    const metadataCache = options.metadataCache ?? await readMetadataCache();
    const snapshot = await buildSnapshot({
      configPath,
      rawConfigUpdatedAt,
      config,
      metadataCache,
      hasOAuthTokens,
      runtimeStatuses,
    });
    await writeMetadataCache(metadataCache);
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
