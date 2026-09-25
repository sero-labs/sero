import type { McpServerEditorInput } from '../../shared/types';
import { ensureOAuthDir, hasOAuthTokens } from '../auth/storage';
import { McpOAuthCoordinator } from '../auth/oauth-coordinator';
import { areMetadataCacheServersEqual, readMetadataCache, removeMetadataCacheEntry, writeMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import { ensureConfigFile, getConfigUpdatedAt, writeConfig } from '../config/io';
import {
  emitAgentPluginCliRefresh,
  hasAgentPluginMcpSourceEvents,
  withAgentPluginMcpSources,
} from '../config/agent-plugin-source';
import type { McpConfigDocument } from '../config/types';
import { createFileEraVerdictStore } from '../manager/era-verdicts';
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
import { closeViewerAction, openToolUiAction, openViewerResourceAction } from './runtime-viewer';
import { reconcileConnection } from './runtime-connect';
import { createKeepAliveScheduler } from './runtime-keep-alive';
import {
  getAutoConnectServerEntries, getChangedServerNames, getKeepAliveServerEntries,
  KEEP_ALIVE_HEALTHCHECK_INTERVAL_MS, shouldAttemptAutoConnect,
} from './runtime-lifecycle';
import { writeState } from '../state/state-io';
import type { ManagerAction, ProxyAction, ToolResult } from '../tools/types';
import { readMcpConfigPair, type McpConfigPair } from './runtime-config';
import { removeServerAction, toggleServerAction, upsertServerAction } from './runtime-servers';
import { executeManagerActionRoute } from './runtime-manager-router';
import type { ManagerActionOptions, SyncedRuntimeState, SyncSnapshotOptions } from './runtime-types';
import { UiResourceHandler } from '../viewer/ui-resource-handler';
import { McpUiServer } from '../viewer/ui-server';

export interface McpRuntime {
  handleSessionStart(ctx: { cwd: string }): Promise<void>;
  handleSessionSwitch(ctx: { cwd: string }): Promise<void>;
  handleSessionShutdown(): Promise<void>;
  executeManagerAction(action: ManagerAction, options?: ManagerActionOptions): Promise<ToolResult>;
  executeProxyAction(action: ProxyAction, options?: {
    cwd?: string; query?: string; serverName?: string; toolName?: string; resourceUri?: string;
    toolArguments?: Record<string, unknown>; argumentsJson?: string; signal?: AbortSignal;
    notify?: (text: string) => void;
  }): Promise<ToolResult>;
}
let runtimeSingleton: McpRuntime | null = null;
export function getMcpRuntime(): McpRuntime {
  runtimeSingleton ??= createMcpRuntime();
  return runtimeSingleton;
}
function createMcpRuntime(): McpRuntime {
  let lastKnownCwd = '';
  let sessionRefCount = 0;
  let lastState: SyncedRuntimeState | null = null;
  let operationQueue: Promise<void> = Promise.resolve();
  const manager = new McpServerManager({
    hasOAuthTokens,
    eraVerdicts: createFileEraVerdictStore(),
    onInventoryChanged: (serverName, connection) => {
      void runExclusive(async () => {
        const config = lastState?.config;
        const serverConfig = config?.mcpServers[serverName];
        if (!config || !serverConfig) return;
        const { nextCache, runtimeStatus } = await reconcileConnection({
          serverName, serverConfig, metadataCache: await readMetadataCache(), connection,
        });
        runtimeStatuses.set(serverName, runtimeStatus);
        await syncSnapshot(lastKnownCwd || undefined, { config, metadataCache: nextCache });
      }).catch((error) => console.error('[mcp] Failed to store a changed MCP inventory', error));
    },
  });
  const authCoordinator = new McpOAuthCoordinator();
  const runtimeStatuses = new Map<string, RuntimeServerStatus>();
  const uiResourceHandler = new UiResourceHandler(manager);
  const uiServer = new McpUiServer(manager);
  const keepAliveScheduler = createKeepAliveScheduler({
    intervalMs: KEEP_ALIVE_HEALTHCHECK_INTERVAL_MS,
    isEnabled: () => sessionRefCount > 0,
    onTick: async () => {
      await runExclusive(async () => {
        const config = lastState?.config ?? await withAgentPluginMcpSources(
          await ensureConfigFile(getMcpConfigPath()),
        );
        await reconcileManagedServers(lastKnownCwd, config, 'keep-alive');
      });
    },
  });
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
        await Promise.all([
          authCoordinator.cancelAll(),
          uiServer.closeAll('runtime-shutdown'),
          manager.closeAll(),
        ]);
        runtimeStatuses.clear();
        if (lastState || lastKnownCwd) {
          try {
            await syncSnapshot(lastKnownCwd || process.cwd());
          } catch (error) {
            console.error('[mcp] Failed to persist idle snapshot on session shutdown', error);
            lastState = null;
          }
        } else {
          lastState = null;
        }
      }
    });
  }
  function executeManagerAction(action: ManagerAction, options: ManagerActionOptions = {}): Promise<ToolResult> {
    return runExclusive(async () => executeManagerActionRoute({
      action,
      options,
      handlers: {
        save_raw_config: () => saveRawConfig(options.cwd, options.rawConfig),
        upsert_server: () => upsertServer(options.cwd, options.serverInput),
        remove_server: () => removeServer(options.cwd, options.serverName),
        enable_server: () => toggleServer(options.cwd, options.serverName, true),
        disable_server: () => toggleServer(options.cwd, options.serverName, false),
        connect_server: () => connectServer(options.cwd, options.serverName, false),
        reconnect_server: () => connectServer(options.cwd, options.serverName, true),
        start_auth: () => startServerAuth(options.cwd, options.serverName),
        complete_auth: () => completeServerAuth(options.cwd, options.serverName, options.callbackUrl),
        cancel_auth: () => cancelServerAuth(options.cwd, options.serverName),
        clear_auth: () => clearServerAuth(options.cwd, options.serverName),
        read_resource: () => readServerResource(options.cwd, options.serverName, options.resourceUri),
        open_resource: () => openViewerResource(options),
        open_tool_ui: () => openToolUi(options),
        close_viewer: async () => closeViewerAction({ uiServer, viewerId: options.viewerId }),
      },
      syncSnapshot,
      reconcileManagedServers,
      startKeepAliveScheduler: () => keepAliveScheduler.start(),
      sessionRefCount,
      hasAttachedPi: hasAgentPluginMcpSourceEvents(),
    }));
  }
  function executeProxyAction(action: ProxyAction, options: { cwd?: string; query?: string; serverName?: string; toolName?: string; resourceUri?: string; toolArguments?: Record<string, unknown>; argumentsJson?: string; signal?: AbortSignal; notify?: (text: string) => void; } = {}): Promise<ToolResult> {
    // Tool calls and resource reads queue only their connection work, so that a
    // server question during a call does not block other MCP work.
    const queued = action !== 'call_tool' && action !== 'read_resource';
    const run = () => executeProxyActionInternal({
      action,
      cwd: options.cwd,
      query: options.query,
      serverName: options.serverName,
      toolName: options.toolName,
      resourceUri: options.resourceUri,
      toolArguments: options.toolArguments,
      argumentsJson: options.argumentsJson,
      signal: options.signal,
      notify: options.notify,
      exclusive: runExclusive,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
    return queued ? runExclusive(run) : run();
  }
  async function saveRawConfig(cwd: string | undefined, rawConfigInput?: string): Promise<ToolResult> {
    return saveRawConfigAction({ cwd, rawConfigInput, writeConfigAndSyncSnapshot });
  }
  const serverMutationContext = {
    manager,
    runtimeStatuses,
    mutateConfig,
    syncSnapshot,
  };
  function upsertServer(cwd: string | undefined, serverInput?: McpServerEditorInput): Promise<ToolResult> {
    return upsertServerAction(serverMutationContext, cwd, serverInput);
  }
  function removeServer(cwd: string | undefined, serverName?: string): Promise<ToolResult> {
    return removeServerAction(serverMutationContext, cwd, serverName);
  }
  function toggleServer(cwd: string | undefined, serverName: string | undefined, enabled: boolean): Promise<ToolResult> {
    return toggleServerAction(serverMutationContext, cwd, serverName, enabled);
  }
  async function connectServer(cwd: string | undefined, serverName: string | undefined, reconnect: boolean): Promise<ToolResult> {
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
  async function completeServerAuth(cwd: string | undefined, serverName: string | undefined, callbackUrl: string | undefined): Promise<ToolResult> {
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
  async function readServerResource(cwd: string | undefined, serverName: string | undefined, resourceUri: string | undefined): Promise<ToolResult> {
    return readServerResourceAction({
      cwd,
      serverName,
      resourceUri,
      manager,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function openViewerResource(options: ManagerActionOptions): Promise<ToolResult> {
    return openViewerResourceAction({
      cwd: options.cwd,
      serverName: options.serverName,
      resourceUri: options.resourceUri,
      manager,
      uiResourceHandler,
      uiServer,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function openToolUi(options: ManagerActionOptions): Promise<ToolResult> {
    return openToolUiAction({
      cwd: options.cwd,
      serverName: options.serverName,
      resourceUri: options.resourceUri,
      toolName: options.toolName,
      toolArguments: options.toolArguments,
      manager,
      uiResourceHandler,
      uiServer,
      setRuntimeStatus: (name, status) => runtimeStatuses.set(name, status),
      syncSnapshot,
    });
  }
  async function reconcileManagedServers(cwd: string | undefined, config: McpConfigDocument, mode: 'startup' | 'keep-alive'): Promise<SyncedRuntimeState | null> {
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
  async function mutateConfig(cwd: string | undefined, mutate: (config: McpConfigDocument) => void, removeServerName?: string, configPair?: McpConfigPair): Promise<SyncedRuntimeState> {
    const current = configPair ?? await readMcpConfigPair();
    const config = current.userConfig;
    const nextConfig: McpConfigDocument = {
      ...config,
      mcpServers: { ...config.mcpServers },
    };
    mutate(nextConfig);
    let metadataCache = await readMetadataCache();
    if (removeServerName) {
      metadataCache = removeMetadataCacheEntry(metadataCache, removeServerName);
    }
    return writeConfigAndSyncSnapshot(cwd, nextConfig, metadataCache, current.effectiveConfig);
  }
  async function writeConfigAndSyncSnapshot(cwd: string | undefined, config: McpConfigDocument, metadataCacheOverride?: McpMetadataCacheDocument, previousConfigOverride?: McpConfigDocument): Promise<SyncedRuntimeState> {
    const configPath = getMcpConfigPath();
    const previousConfig = previousConfigOverride ?? (await readMcpConfigPair()).effectiveConfig;
    let metadataCache = metadataCacheOverride ?? await readMetadataCache();
    const effectiveConfig = await withAgentPluginMcpSources(config);
    for (const serverName of getChangedServerNames(previousConfig, effectiveConfig)) {
      uiServer.closeForServer(serverName);
      await manager.close(serverName);
      runtimeStatuses.delete(serverName);
      metadataCache = removeMetadataCacheEntry(metadataCache, serverName);
    }
    await writeConfig(config, configPath);
    const rawConfigUpdatedAt = await getConfigUpdatedAt(configPath);
    const synced = await syncSnapshot(cwd, { config: effectiveConfig, rawConfigUpdatedAt, metadataCache });
    return await reconcileManagedServers(cwd, effectiveConfig, 'startup') ?? synced;
  }
  async function syncSnapshot(cwd?: string, options: SyncSnapshotOptions = {}): Promise<SyncedRuntimeState> {
    if (cwd) {
      lastKnownCwd = cwd;
    }
    const resolvedCwd = lastKnownCwd || cwd || process.cwd();
    const configPath = getMcpConfigPath();
    const statePath = getMcpStatePath(resolvedCwd);
    await ensureOAuthDir();
    const [config, rawConfigUpdatedAt, metadataCache] = await Promise.all([
      options.config !== undefined
        ? Promise.resolve(options.config)
        : ensureConfigFile(configPath).then(withAgentPluginMcpSources),
      options.rawConfigUpdatedAt != null ? Promise.resolve(options.rawConfigUpdatedAt) : getConfigUpdatedAt(configPath),
      options.metadataCache !== undefined ? Promise.resolve(options.metadataCache) : readMetadataCache(),
    ]);
    const refreshAgentPluginCli = !lastState
      || !areMetadataCacheServersEqual(lastState.metadataCache.servers, metadataCache.servers);
    const snapshot = await buildSnapshot({
      configPath,
      rawConfigUpdatedAt,
      config,
      metadataCache,
      hasOAuthTokens,
      runtimeStatuses,
    });
    await writeMetadataCache(metadataCache);
    if (refreshAgentPluginCli) {
      emitAgentPluginCliRefresh();
    }
    await writeState(snapshot, statePath);
    lastState = { configPath, statePath, config, metadataCache, rawConfigUpdatedAt, snapshot };
    return lastState;
  }
  return {
    handleSessionStart,
    handleSessionSwitch,
    handleSessionShutdown,
    executeManagerAction,
    executeProxyAction,
  };
}
