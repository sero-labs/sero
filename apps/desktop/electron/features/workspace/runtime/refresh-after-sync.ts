import type { DevServer } from '@/types/ipc';
import { containerManager } from '@electron/features/container/core/singleton';
import {
  getRuntimeCapabilityEntry,
  resolveWorkspaceRuntime,
  type WorkspaceRuntimeResolution,
} from '@electron/features/workspace/runtime-resolution';
import { runWorkspaceCommand } from './run-workspace-command';
import { startManagedDevServer } from './start-managed-dev-server';
import {
  detectDependencyInstallCommand,
  detectDevServerCommand,
  summarizeVerificationFailure,
  type CommandResult,
} from './verification';

const RUNTIME_INSTALL_TIMEOUT_MS = 600_000;
const AUTO_START_LOG_PATH = '/tmp/sero-post-sync-dev-server.log';

export interface WorkspaceRuntimeRefreshResult {
  refreshed: boolean;
  installCommand?: string;
  dependenciesInstalled: boolean;
  restartedServerIds: string[];
  autoStartedServerId?: string;
  reason?: string;
}

interface AutoStartResult {
  serverId?: string;
  reason?: string;
}

interface RuntimeRefreshDeps {
  detectInstallCommand?: (workspacePath: string) => Promise<string | null>;
  detectDevCommand?: (workspacePath: string) => Promise<string | null>;
  runCommand?: typeof runWorkspaceCommand;
  listDevServers?: (workspaceId: string) => DevServer[];
  restartDevServer?: (serverId: string) => Promise<boolean>;
  autoStartDevServer?: (workspaceId: string, workspacePath: string, command: string) => Promise<AutoStartResult>;
  resolveRuntime?: (workspaceId: string) => Promise<WorkspaceRuntimeResolution>;
}

export async function refreshWorkspaceRuntimeAfterSync(
  workspaceId: string,
  workspacePath: string,
  deps: RuntimeRefreshDeps = {},
): Promise<WorkspaceRuntimeRefreshResult> {
  const detectInstallCommand = deps.detectInstallCommand ?? detectDependencyInstallCommand;
  const detectDevCommand = deps.detectDevCommand ?? detectDevServerCommand;
  const runCommand = deps.runCommand ?? runWorkspaceCommand;
  const listDevServers = deps.listDevServers ?? ((id: string) => containerManager.devServers.list(id));
  const restartDevServer = deps.restartDevServer ?? ((serverId: string) => containerManager.devServers.restart(serverId));
  const autoStartDevServer = deps.autoStartDevServer ?? autoStartDetectedDevServer;
  const resolveRuntime = deps.resolveRuntime ?? resolveWorkspaceRuntime;

  const result: WorkspaceRuntimeRefreshResult = {
    refreshed: false,
    dependenciesInstalled: false,
    restartedServerIds: [],
  };

  const installCommand = await detectInstallCommand(workspacePath);
  if (installCommand) {
    result.installCommand = installCommand;
    const installResult = await runCommand(
      workspaceId,
      workspacePath,
      installCommand,
      RUNTIME_INSTALL_TIMEOUT_MS,
    );
    if (installResult.exitCode !== 0) {
      return {
        ...result,
        reason: `Dependency install failed: ${summarizeCommandFailure(installCommand, installResult.stderr, installResult.stdout)}`,
      };
    }
    result.dependenciesInstalled = true;
    result.refreshed = true;
  }

  const servers = listDevServers(workspaceId).filter((server) => server.scope === 'workspace');
  if (servers.length > 0) {
    for (const server of servers) {
      if (await restartDevServer(server.id)) {
        result.restartedServerIds.push(server.id);
      }
    }

    if (result.restartedServerIds.length !== servers.length) {
      return {
        ...result,
        refreshed: result.refreshed || result.restartedServerIds.length > 0,
        reason: `Failed to restart ${servers.length - result.restartedServerIds.length} dev server(s).`,
      };
    }

    return {
      ...result,
      refreshed: result.refreshed || result.restartedServerIds.length > 0,
    };
  }

  const devCommand = await detectDevCommand(workspacePath);
  if (!devCommand) {
    return result;
  }

  const runtime = await resolveRuntime(workspaceId);
  if (runtime.actualRuntime !== 'container') {
    return {
      ...result,
      reason: getRuntimeCapabilityEntry(runtime, 'managedDevServers').detail,
    };
  }

  const autoStart = await autoStartDevServer(workspaceId, workspacePath, devCommand);
  if (!autoStart.serverId) {
    return {
      ...result,
      reason: autoStart.reason ?? 'Failed to auto-start a dev server after sync.',
    };
  }

  return {
    ...result,
    refreshed: true,
    autoStartedServerId: autoStart.serverId,
  };
}

async function autoStartDetectedDevServer(
  workspaceId: string,
  workspacePath: string,
  command: string,
): Promise<AutoStartResult> {
  const server = await startManagedDevServer({
    workspaceId,
    workspacePath,
    cwdPath: workspacePath,
    command,
    logPath: AUTO_START_LOG_PATH,
    scope: 'workspace',
  });
  return server.serverId
    ? { serverId: server.serverId }
    : { reason: server.reason };
}

function summarizeCommandFailure(command: string, stderr: string, stdout: string): string {
  return summarizeVerificationFailure({
    command,
    success: false,
    stderr,
    stdout,
    durationMs: 0,
  } satisfies CommandResult);
}
