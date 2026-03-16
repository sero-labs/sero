import type { DevServer } from '../../src/types/ipc';
import type { DetectedPort } from '../container/port-forward';
import { containerManager } from '../container/singleton';
import { buildWorkspaceContainerConfig } from '../container/workspace-container-config';
import { workspaceManager } from '../workspace';
import { runWorkspaceCommand } from './workspace-command-runner';
import {
  detectDependencyInstallCommand,
  detectDevServerCommand,
  summarizeVerificationFailure,
  type CommandResult,
} from './verification';

const RUNTIME_INSTALL_TIMEOUT_MS = 600_000;
const AUTO_START_TIMEOUT_MS = 20_000;
const AUTO_START_POLL_MS = 500;
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

  const servers = listDevServers(workspaceId);
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
  const containerConfig = await buildWorkspaceContainerConfig(
    workspaceManager,
    workspaceId,
    workspacePath,
  );
  await containerManager.ensure(containerConfig);

  const beforePorts = new Set(
    containerManager.portScanner.getPorts(workspaceId).map((port) => port.port),
  );
  const escapedCommand = command.replace(/'/g, "'\\''");
  const startCommand = `setsid sh -c '${escapedCommand} > ${AUTO_START_LOG_PATH} 2>&1 &'`;
  const startResult = await runWorkspaceCommand(
    workspaceId,
    workspacePath,
    startCommand,
    30_000,
  );
  if (startResult.exitCode !== 0) {
    return {
      reason: `Dev server start failed: ${summarizeCommandFailure(command, startResult.stderr, startResult.stdout)}`,
    };
  }

  const port = await waitForAutoStartedPort(workspaceId, beforePorts);
  if (!port) {
    return {
      reason: `No dev server port was detected after running ${command}.`,
    };
  }

  const framework = detectFrameworkHint(command);
  const server = containerManager.devServers.register({
    workspaceId,
    name: buildDevServerName(framework),
    port: port.port,
    command,
    framework,
  });
  return { serverId: server.id };
}

async function waitForAutoStartedPort(
  workspaceId: string,
  beforePorts: Set<number>,
): Promise<DetectedPort | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < AUTO_START_TIMEOUT_MS) {
    containerManager.portScanner.triggerScan(workspaceId);
    await sleep(AUTO_START_POLL_MS);

    const currentPorts = containerManager.portScanner.getPorts(workspaceId);
    const addedPorts = currentPorts.filter((port) => !beforePorts.has(port.port));
    if (addedPorts.length > 0) {
      return addedPorts[0];
    }
  }

  return null;
}

function detectFrameworkHint(command: string): string | undefined {
  const normalized = command.toLowerCase();
  if (normalized.includes('vite')) return 'vite';
  if (normalized.includes('next')) return 'next';
  if (normalized.includes('nuxt')) return 'nuxt';
  if (normalized.includes('astro')) return 'astro';
  if (normalized.includes('react-scripts')) return 'react';
  if (normalized.includes('storybook')) return 'storybook';
  return undefined;
}

function buildDevServerName(framework?: string): string {
  switch (framework) {
    case 'vite':
      return 'Vite Dev Server';
    case 'next':
      return 'Next.js Dev Server';
    case 'nuxt':
      return 'Nuxt Dev Server';
    case 'astro':
      return 'Astro Dev Server';
    case 'react':
      return 'React Dev Server';
    case 'storybook':
      return 'Storybook Dev Server';
    default:
      return 'Dev Server';
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
