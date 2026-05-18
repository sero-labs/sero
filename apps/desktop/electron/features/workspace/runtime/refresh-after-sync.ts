import type { RuntimeDevServer } from './types';
import { runtimeManager, type RuntimeManager } from './runtime-manager';
import type { WorkspaceRuntimeResolution } from '@electron/features/workspace/runtime-resolution';
import type { NativeBuildToolsRequiredMetadata } from './native-build/types';
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
  nativeBuildToolsRequired?: NativeBuildToolsRequiredMetadata;
}

interface AutoStartResult {
  serverId?: string;
  reason?: string;
}

interface RuntimeRefreshDeps {
  detectInstallCommand?: (workspacePath: string) => Promise<string | null>;
  detectDevCommand?: (workspacePath: string) => Promise<string | null>;
  runCommand?: typeof runWorkspaceCommand;
  listDevServers?: (workspaceId: string) => Promise<RuntimeDevServer[]>;
  restartDevServer?: (serverId: string) => Promise<boolean>;
  autoStartDevServer?: (workspaceId: string, workspacePath: string, command: string) => Promise<AutoStartResult>;
  runtimeManager?: RuntimeManager;
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
  const manager = deps.runtimeManager ?? runtimeManager;
  const listDevServers = deps.listDevServers ?? (async (id: string) => {
    const runtime = await manager.getRuntime(id);
    return (await runtime.getDevServerStatus({})).servers;
  });
  const restartDevServer = deps.restartDevServer ?? (async (serverId: string) => {
    const runtime = await manager.getRuntime(workspaceId);
    await runtime.restartDevServer({ serverId });
    return true;
  });
  const autoStartDevServer = deps.autoStartDevServer ?? autoStartDetectedDevServer;

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
      { classifyNativeBuildFailure: true },
    );
    if (installResult.exitCode !== 0) {
      return {
        ...result,
        reason: `Dependency install failed: ${summarizeCommandFailure(installCommand, installResult.stderr, installResult.stdout)}`,
        nativeBuildToolsRequired: installResult.nativeBuildToolsRequired,
      };
    }
    result.dependenciesInstalled = true;
    result.refreshed = true;
  }

  const servers = (await listDevServers(workspaceId)).filter((server) => (
    (server as RuntimeDevServer & { scope?: string }).scope !== 'card-preview'
  ));
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

  if (deps.resolveRuntime) {
    const legacyRuntime = await deps.resolveRuntime(workspaceId);
    const entry = legacyRuntime.capabilityAudit.find((candidate) => candidate.key === 'managedDevServers');
    if (legacyRuntime.actualRuntime !== 'container' || legacyRuntime.fallbackCode === 'container_unavailable' || entry?.available === false) {
      return { ...result, reason: entry?.detail ?? 'Managed dev servers are not available for the selected runtime.' };
    }
  } else {
    const runtime = await manager.getRuntime(workspaceId);
    if (!runtime.capabilities.devServers.start) {
      return {
        ...result,
        reason: `Managed dev servers are not available for ${runtime.backend} runtime.`,
      };
    }
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
