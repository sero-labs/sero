import { readRawConfig } from '../config/io';
import type { McpConfigDocument } from '../config/types';
import { createToolResult, type ManagerAction, type ToolResult } from '../tools/types';
import type { ManagerActionOptions, SyncedRuntimeState, SyncSnapshotOptions } from './runtime-types';
import { formatDiagnostics, formatStatusSummary } from './runtime-utils';

export interface ManagerActionRouterInput {
  action: ManagerAction;
  options: ManagerActionOptions;
  handlers: Partial<Record<ManagerAction, () => Promise<ToolResult>>>;
  syncSnapshot: (cwd?: string, options?: SyncSnapshotOptions) => Promise<SyncedRuntimeState>;
  reconcileManagedServers: (
    cwd: string | undefined,
    config: McpConfigDocument,
    mode: 'startup' | 'keep-alive',
  ) => Promise<SyncedRuntimeState | null>;
  startKeepAliveScheduler: () => void;
  sessionRefCount: number;
  hasAttachedPi: boolean;
}

export async function executeManagerActionRoute(input: ManagerActionRouterInput): Promise<ToolResult> {
  const directHandler = input.handlers[input.action];
  if (directHandler) {
    return directHandler();
  }

  const synced = await input.syncSnapshot(input.options.cwd);

  if (input.action === 'bootstrap' || input.action === 'refresh') {
    input.startKeepAliveScheduler();
    const nextState = await input.reconcileManagedServers(input.options.cwd, synced.config, 'startup') ?? synced;
    const prefix = input.action === 'refresh' ? 'Refreshed' : 'Initialized';
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

  if (input.action === 'status') {
    return createToolResult(
      `Compatibility note: \`mcp_manager\` action="status" is deprecated for normal agent work. Use the \`mcp\` tool with action=\"status\" (or related \`mcp\` actions like list/search/tools/resources/describe/call/read) instead.\n\n${formatStatusSummary(synced.snapshot)}`,
      {
        snapshotWritten: true,
        configPath: synced.configPath,
        statePath: synced.statePath,
        serverCount: synced.snapshot.summary.totalServers,
        deprecatedAction: true,
      },
    );
  }

  if (input.action === 'get_raw_config') {
    const rawConfig = await readRawConfig(synced.configPath);
    return createToolResult(rawConfig.trim() || '{}', {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      rawConfig,
    });
  }

  if (input.action === 'get_diagnostics') {
    return createToolResult(formatDiagnostics({
      configPath: synced.configPath,
      statePath: synced.statePath,
      rawConfigUpdatedAt: synced.rawConfigUpdatedAt,
      snapshot: synced.snapshot,
      sessionRefCount: input.sessionRefCount,
      hasAttachedPi: input.hasAttachedPi,
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
}
