import path from 'path';

import type { DevServer } from '@/types/ipc';
import type { DetectedPort } from '@electron/features/container/network/port-forward';
import { containerManager } from '@electron/features/container/core/singleton';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import { workspaceManager } from '@electron/features/workspace/manager';

const AUTO_START_TIMEOUT_MS = 20_000;
const AUTO_START_POLL_MS = 500;
const START_TIMEOUT_MS = 30_000;

export interface StartManagedDevServerOptions {
  workspaceId: string;
  workspacePath: string;
  cwdPath: string;
  command: string;
  name?: string;
  framework?: string;
  scope?: DevServer['scope'];
  cardId?: string;
  logPath?: string;
}

export interface StartManagedDevServerResult {
  serverId?: string;
  url?: string;
  port?: number;
  reason?: string;
}

interface StartManagedDevServerDeps {
  ensureContainer?: (workspaceId: string, workspacePath: string) => Promise<void>;
  getPorts?: (workspaceId: string) => Array<{ port: number; url: string }>;
  triggerScan?: (workspaceId: string) => void;
  execInContainer?: (
    workspaceId: string,
    command: string,
    cwd: string,
    timeoutMs: number,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  registerServer?: (params: {
    workspaceId: string;
    name: string;
    port: number;
    command: string;
    framework?: string;
    cwd: string;
    scope?: DevServer['scope'];
    cardId?: string;
  }) => DevServer;
}

export async function startManagedDevServer(
  options: StartManagedDevServerOptions,
  deps: StartManagedDevServerDeps = {},
): Promise<StartManagedDevServerResult> {
  const ensureContainer = deps.ensureContainer ?? ensureWorkspaceContainer;
  const getPorts = deps.getPorts ?? ((workspaceId: string) => containerManager.portScanner.getPorts(workspaceId));
  const triggerScan = deps.triggerScan ?? ((workspaceId: string) => containerManager.portScanner.triggerScan(workspaceId));
  const execInContainer = deps.execInContainer
    ?? ((workspaceId: string, command: string, cwd: string, timeoutMs: number) =>
      containerManager.exec(workspaceId, command, cwd, timeoutMs));
  const registerServer = deps.registerServer
    ?? ((params) => containerManager.devServers.register(params));

  const containerCwd = toContainerWorkspacePath(options.workspacePath, options.cwdPath);
  if (!containerCwd) {
    return {
      reason: `Cannot start a dev server outside the workspace root: ${options.cwdPath}`,
    };
  }

  await ensureContainer(options.workspaceId, options.workspacePath);

  const beforePorts = new Set(getPorts(options.workspaceId).map((port) => port.port));
  const escapedCommand = options.command.replace(/'/g, "'\\''");
  const logPath = options.logPath ?? '/tmp/sero-dev-server.log';
  const startCommand = `setsid sh -c '${escapedCommand} > ${logPath} 2>&1 &'`;
  const startResult = await execInContainer(
    options.workspaceId,
    startCommand,
    containerCwd,
    START_TIMEOUT_MS,
  );
  if (startResult.exitCode !== 0) {
    return {
      reason: summarizeStartFailure(options.command, startResult.stderr, startResult.stdout),
    };
  }

  const startedPort = await waitForStartedPort(
    options.workspaceId,
    beforePorts,
    { getPorts, triggerScan },
  );
  if (!startedPort) {
    return {
      reason: `No dev server port was detected after running ${options.command}.`,
    };
  }

  const framework = options.framework ?? detectFrameworkHint(options.command);
  const server = registerServer({
    workspaceId: options.workspaceId,
    name: options.name ?? buildDevServerName(framework),
    port: startedPort.port,
    command: options.command,
    framework,
    cwd: containerCwd,
    scope: options.scope,
    cardId: options.cardId,
  });
  return {
    serverId: server.id,
    url: server.url,
    port: startedPort.port,
  };
}

export function toContainerWorkspacePath(
  workspacePath: string,
  cwdPath: string,
): string | null {
  const rel = path.relative(workspacePath, cwdPath);
  if (rel.startsWith('..')) return null;
  if (!rel || rel === '.') return '/workspace';
  return path.posix.join('/workspace', ...rel.split(path.sep));
}

export function detectFrameworkHint(command: string): string | undefined {
  const normalized = command.toLowerCase();
  if (normalized.includes('vite')) return 'vite';
  if (normalized.includes('next')) return 'next';
  if (normalized.includes('nuxt')) return 'nuxt';
  if (normalized.includes('astro')) return 'astro';
  if (normalized.includes('react-scripts')) return 'react';
  if (normalized.includes('storybook')) return 'storybook';
  return undefined;
}

export function buildDevServerName(framework?: string): string {
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

async function ensureWorkspaceContainer(
  workspaceId: string,
  workspacePath: string,
): Promise<void> {
  const containerConfig = await buildWorkspaceContainerConfig(
    workspaceManager,
    workspaceId,
    workspacePath,
  );
  await containerManager.ensure(containerConfig);
}

async function waitForStartedPort(
  workspaceId: string,
  beforePorts: Set<number>,
  deps: Pick<StartManagedDevServerDeps, 'getPorts' | 'triggerScan'>,
): Promise<DetectedPort | null> {
  const getPorts = deps.getPorts ?? ((id: string) => containerManager.portScanner.getPorts(id));
  const triggerScan = deps.triggerScan ?? ((id: string) => containerManager.portScanner.triggerScan(id));
  const startedAt = Date.now();

  while (Date.now() - startedAt < AUTO_START_TIMEOUT_MS) {
    triggerScan(workspaceId);
    await sleep(AUTO_START_POLL_MS);

    const currentPorts = getPorts(workspaceId);
    const addedPort = currentPorts.find((port) => !beforePorts.has(port.port));
    if (addedPort) {
      return addedPort as DetectedPort;
    }
  }

  return null;
}

function summarizeStartFailure(command: string, stderr: string, stdout: string): string {
  const output = `${stderr}\n${stdout}`
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-800);
  return `Dev server start failed for "${command}": ${output || 'command failed with no output'}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
