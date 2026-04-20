import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { McpServerEditorInput } from '../../shared/types';
import { validateServerEditorInput } from '../../shared/types';
import { ensureOAuthDir, hasOAuthTokens } from '../auth/storage';
import {
  readMetadataCache,
  writeMetadataCache,
  type McpMetadataCacheDocument,
} from '../cache/metadata-cache';
import {
  ensureConfigFile,
  getConfigUpdatedAt,
  normalizeConfigDocument,
  readRawConfig,
  writeConfig,
} from '../config/io';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import { buildSnapshot } from '../state/snapshot';
import { getMcpConfigPath, getMcpStatePath } from '../state/paths';
import { writeState } from '../state/state-io';
import {
  createToolResult,
  type ManagerAction,
  type ProxyAction,
  type ToolResult,
} from '../tools/types';
import {
  buildServerConfig,
  formatDiagnostics,
  formatServerList,
  formatStatusSummary,
  mutationErrorResult,
} from './runtime-utils';

interface ManagerActionOptions {
  cwd?: string;
  rawConfig?: string;
  serverName?: string;
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
  let operationQueue: Promise<void> = Promise.resolve();

  function attachPi(pi: ExtensionAPI): void {
    attachedPi = pi;
  }

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

  function handleSessionStart(ctx: { cwd: string }): Promise<void> {
    return runExclusive(async () => {
      sessionRefCount += 1;
      await syncSnapshot(ctx.cwd);
    });
  }

  function handleSessionSwitch(ctx: { cwd: string }): Promise<void> {
    return runExclusive(async () => {
      await syncSnapshot(ctx.cwd);
    });
  }

  function handleSessionShutdown(): Promise<void> {
    return runExclusive(async () => {
      sessionRefCount = Math.max(0, sessionRefCount - 1);
      if (sessionRefCount === 0) {
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

      const prefix = action === 'refresh' ? 'Refreshed' : 'Initialized';
      return createToolResult(
        `${prefix} MCP app state for ${synced.snapshot.summary.totalServers} configured server(s).`,
        {
          snapshotWritten: true,
          configPath: synced.configPath,
          statePath: synced.statePath,
          serverCount: synced.snapshot.summary.totalServers,
        },
      );
    });
  }

  function executeProxyAction(
    action: ProxyAction,
    options: { cwd?: string } = {},
  ): Promise<ToolResult> {
    return runExclusive(async () => {
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
    });
  }

  async function saveRawConfig(
    cwd: string | undefined,
    rawConfigInput?: string,
  ): Promise<ToolResult> {
    if (!rawConfigInput?.trim()) {
      return createToolResult('Error: Raw config cannot be empty.', { snapshotWritten: false });
    }

    try {
      const normalized = normalizeConfigDocument(JSON.parse(rawConfigInput));
      const synced = await writeConfigAndSyncSnapshot(cwd, normalized);
      return createToolResult(
        `Saved MCP config with ${synced.snapshot.summary.totalServers} configured server(s).`,
        {
          snapshotWritten: true,
          configPath: synced.configPath,
          statePath: synced.statePath,
          rawConfig: `${JSON.stringify(normalized, null, 2)}\n`,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createToolResult(`Error: Failed to save raw MCP config. ${message}`, {
        snapshotWritten: false,
      });
    }
  }

  async function upsertServer(
    cwd: string | undefined,
    serverInput?: McpServerEditorInput,
  ): Promise<ToolResult> {
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
          originalName &&
          originalName !== nextName &&
          nextServers[nextName],
        );
        const hasCreateCollision = Boolean(!originalName && nextServers[nextName]);

        if (hasRenameCollision || hasCreateCollision) {
          throw new Error(`A server named "${nextName}" already exists.`);
        }

        const existing = originalName ? nextServers[originalName] : undefined;
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
    } catch (error) {
      return mutationErrorResult(error);
    }
  }

  async function removeServer(
    cwd: string | undefined,
    serverName?: string,
  ): Promise<ToolResult> {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }

    try {
      const synced = await mutateConfig(cwd, (config) => {
        if (!config.mcpServers[normalizedServerName]) {
          throw new Error(`Server "${normalizedServerName}" does not exist.`);
        }

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
    } catch (error) {
      return mutationErrorResult(error);
    }
  }

  async function toggleServer(
    cwd: string | undefined,
    serverName: string | undefined,
    enabled: boolean,
  ): Promise<ToolResult> {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      return createToolResult('Error: Server name is required.', { snapshotWritten: false });
    }

    try {
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

      return createToolResult(
        `${enabled ? 'Enabled' : 'Disabled'} MCP server "${normalizedServerName}".`,
        {
          snapshotWritten: true,
          configPath: synced.configPath,
          statePath: synced.statePath,
          serverCount: synced.snapshot.summary.totalServers,
        },
      );
    } catch (error) {
      return mutationErrorResult(error);
    }
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
    return writeConfigAndSyncSnapshot(cwd, nextConfig);
  }

  async function writeConfigAndSyncSnapshot(
    cwd: string | undefined,
    config: McpConfigDocument,
  ): Promise<SyncedRuntimeState> {
    const configPath = getMcpConfigPath();
    await writeConfig(config, configPath);
    const rawConfigUpdatedAt = await getConfigUpdatedAt(configPath);
    return syncSnapshot(cwd, { config, rawConfigUpdatedAt });
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

