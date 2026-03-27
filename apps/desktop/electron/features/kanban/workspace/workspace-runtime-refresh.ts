import type { DevServer } from '../../../../src/types/ipc';
import { containerManager } from '../../container/core/singleton';
import { workspaceManager } from '../../workspace/manager';
import { runWorkspaceCommand } from './workspace-command-runner';
import { startManagedDevServer } from '../implementation/dev-server-launch';
import {
  detectDependencyInstallCommand,
  detectDevServerCommand,
  summarizeVerificationFailure,
  type CommandResult,
} from '../quality/verification';

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
  isContainerEnabled?: (workspaceId: string) => Promise<boolean>;
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
  const isContainerEnabled = deps.isContainerEnabled ?? ((id: string) => workspaceManager.isContainerEnabled(id));

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

  if (!(await isContainerEnabled(workspaceId))) {
    return {
      ...result,
      reason: 'Workspace is not container-enabled; skipped auto-starting a dev server.',
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
