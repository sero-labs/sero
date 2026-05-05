import type { DevServer } from '@/types/ipc';
import type { DetectedPort } from '@electron/features/container/network/port-forward';
import { containerManager } from '@electron/features/container/core/singleton';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import { workspaceManager } from '@electron/features/workspace/manager';
import { toWorkspaceContainerPath } from './container-path';
import { createWorkspaceRuntimeFacade } from './runtime-facade';
import type { WorkspaceRuntimeFacade } from './types';

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
  port?: number;
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
    url?: string;
  }) => DevServer;
  createRuntime?: (workspaceId: string) => Promise<WorkspaceRuntimeFacade>;
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
  const createRuntime = deps.createRuntime ?? createWorkspaceRuntimeFacade;
  const runtime = await createRuntime(options.workspaceId);

  if (
    runtime.providerId === 'openshell-local'
    || runtime.providerId === 'openshell-remote'
    || runtime.providerId === 'openshell-cloud'
  ) {
    return startOpenShellManagedDevServer(options, runtime, registerServer);
  }

  const containerCwd = toWorkspaceContainerPath(options.workspacePath, options.cwdPath);
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

async function startOpenShellManagedDevServer(
  options: StartManagedDevServerOptions,
  runtime: WorkspaceRuntimeFacade,
  registerServer: NonNullable<StartManagedDevServerDeps['registerServer']>,
): Promise<StartManagedDevServerResult> {
  if (!runtime.capabilities.managedDevServers || !runtime.capabilities.portForward || !runtime.forwardPort) {
    return { reason: `${formatOpenShellRuntimeName(runtime.providerId)} runtime does not support managed dev-server port forwarding.` };
  }

  const port = options.port ?? inferPreviewPort(options.command, options.framework);
  if (!port) {
    return {
      reason: `Cannot infer a preview port for "${options.command}". Specify an explicit port for ${formatOpenShellRuntimeName(runtime.providerId)} previews.`,
    };
  }

  const escapedCommand = options.command.replace(/'/g, "'\\''");
  const logPath = options.logPath ?? '/tmp/sero-dev-server.log';
  const startCommand = `setsid sh -c '${escapedCommand} > ${logPath} 2>&1 &'`;
  const startResult = await runtime.exec(startCommand, {
    cwd: options.cwdPath,
    timeoutMs: START_TIMEOUT_MS,
  });
  if (startResult.exitCode !== 0) {
    return {
      reason: summarizeStartFailure(options.command, startResult.stderr, startResult.stdout),
    };
  }

  const forwarded = await runtime.forwardPort(port);
  const framework = options.framework ?? detectFrameworkHint(options.command);
  const server = registerServer({
    workspaceId: options.workspaceId,
    name: options.name ?? buildDevServerName(framework),
    port: forwarded.localPort,
    command: options.command,
    framework,
    cwd: options.cwdPath,
    scope: options.scope,
    cardId: options.cardId,
    url: forwarded.localUrl,
  });

  return {
    serverId: server.id,
    url: server.url,
    port: forwarded.localPort,
  };
}

function formatOpenShellRuntimeName(providerId: WorkspaceRuntimeFacade['providerId']): string {
  if (providerId === 'openshell-cloud') return 'OpenShell Cloud';
  return providerId === 'openshell-remote' ? 'OpenShell Remote' : 'OpenShell Local';
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

function inferPreviewPort(command: string, framework?: string): number | null {
  const explicit = inferExplicitPort(command);
  if (explicit) return explicit;

  switch (framework ?? detectFrameworkHint(command)) {
    case 'vite':
      return 5173;
    case 'next':
      return 3000;
    case 'astro':
      return 4321;
    case 'storybook':
      return 6006;
    default:
      return null;
  }
}

function inferExplicitPort(command: string): number | null {
  const patterns = [
    /(?:^|\s)(?:--port|-p)\s+([0-9]{2,5})(?:\s|$)/,
    /(?:^|\s)PORT=([0-9]{2,5})(?:\s|$)/,
    /(?:^|\s)python3?\s+-m\s+http\.server\s+([0-9]{2,5})(?:\s|$)/,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (!match) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) return port;
  }
  return null;
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
