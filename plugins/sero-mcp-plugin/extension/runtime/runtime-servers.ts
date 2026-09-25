import type { McpServerEditorInput } from '../../shared/types';
import { validateServerEditorInput } from '../../shared/types';
import { setAgentPluginServerEnabled } from '../config/agent-plugin-client-state';
import type { McpConfigDocument } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ToolResult } from '../tools/types';
import { readMcpConfigPair, withMcpServerEnabled, type McpConfigPair } from './runtime-config';
import { buildServerConfig, mutationErrorResult } from './runtime-utils';
import type { SyncedRuntimeState, SyncSnapshotOptions } from './runtime-types';

/** Runtime state that the server edit actions read and change. */
export interface ServerMutationContext {
  manager: McpServerManager;
  runtimeStatuses: Map<string, RuntimeServerStatus>;
  mutateConfig: (
    cwd: string | undefined,
    mutate: (config: McpConfigDocument) => void,
    removeServerName?: string,
    configPair?: McpConfigPair,
  ) => Promise<SyncedRuntimeState>;
  syncSnapshot: (cwd?: string, options?: SyncSnapshotOptions) => Promise<SyncedRuntimeState>;
}

function savedResult(message: string, synced: SyncedRuntimeState): ToolResult {
  return createToolResult(message, {
    snapshotWritten: true,
    configPath: synced.configPath,
    statePath: synced.statePath,
    serverCount: synced.snapshot.summary.totalServers,
  });
}

function managedServerError(server: McpConfigDocument['mcpServers'][string]): Error | null {
  const managed = server?.managedByAgentPlugin;
  return managed
    ? new Error(`Server "${managed.serverName}" is managed by Agent Plugin ${managed.pluginName}.`)
    : null;
}

export async function upsertServerAction(
  context: ServerMutationContext,
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
    const configPair = await readMcpConfigPair();
    const effectiveConfig = configPair.effectiveConfig;
    const originalName = serverInput.originalServerName?.trim();
    const nextName = serverInput.serverName.trim();
    const managedError = [originalName, nextName]
      .filter((name): name is string => !!name)
      .map((name) => managedServerError(effectiveConfig.mcpServers[name]))
      .find((error) => error);
    if (managedError) {
      throw managedError;
    }
    const synced = await context.mutateConfig(cwd, (config) => {
      const nextServers = { ...config.mcpServers };
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
        context.runtimeStatuses.delete(originalName);
      }
      nextServers[nextName] = buildServerConfig(serverInput, existing);
      config.mcpServers = nextServers;
    }, undefined, configPair);
    return savedResult(`Saved MCP server "${serverInput.serverName.trim()}".`, synced);
  } catch (error) {
    return mutationErrorResult(error);
  }
}

export async function removeServerAction(
  context: ServerMutationContext,
  cwd: string | undefined,
  serverName?: string,
): Promise<ToolResult> {
  const normalizedServerName = serverName?.trim();
  if (!normalizedServerName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }
  try {
    const configPair = await readMcpConfigPair();
    const managedError = managedServerError(configPair.effectiveConfig.mcpServers[normalizedServerName]);
    if (managedError) {
      throw managedError;
    }
    await context.manager.close(normalizedServerName);
    context.runtimeStatuses.delete(normalizedServerName);
    const synced = await context.mutateConfig(cwd, (config) => {
      if (!config.mcpServers[normalizedServerName]) {
        throw new Error(`Server "${normalizedServerName}" does not exist.`);
      }
      const nextServers = { ...config.mcpServers };
      delete nextServers[normalizedServerName];
      config.mcpServers = nextServers;
    }, normalizedServerName, configPair);
    return savedResult(`Removed MCP server "${normalizedServerName}".`, synced);
  } catch (error) {
    return mutationErrorResult(error);
  }
}

export async function toggleServerAction(
  context: ServerMutationContext,
  cwd: string | undefined,
  serverName: string | undefined,
  enabled: boolean,
): Promise<ToolResult> {
  const normalizedServerName = serverName?.trim();
  if (!normalizedServerName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }
  try {
    const configPair = await readMcpConfigPair();
    const effectiveConfig = configPair.effectiveConfig;
    const managedServer = effectiveConfig.mcpServers[normalizedServerName];
    if (!enabled) {
      await context.manager.close(normalizedServerName);
      context.runtimeStatuses.delete(normalizedServerName);
    }
    if (managedServer?.managedByAgentPlugin) {
      await setAgentPluginServerEnabled(normalizedServerName, enabled);
      const nextConfig = withMcpServerEnabled(effectiveConfig, normalizedServerName, enabled);
      const synced = await context.syncSnapshot(cwd, { config: nextConfig });
      return savedResult(
        `${enabled ? 'Enabled' : 'Disabled'} managed MCP server "${managedServer.managedByAgentPlugin.serverName}".`,
        synced,
      );
    }
    const synced = await context.mutateConfig(cwd, (config) => {
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
    }, undefined, configPair);
    return savedResult(`${enabled ? 'Enabled' : 'Disabled'} MCP server "${normalizedServerName}".`, synced);
  } catch (error) {
    return mutationErrorResult(error);
  }
}
