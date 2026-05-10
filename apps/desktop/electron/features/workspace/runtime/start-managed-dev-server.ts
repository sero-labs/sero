import type { DevServer } from '@/types/ipc';
import { runtimeManager, type RuntimeManager } from './runtime-manager';
import { toWorkspaceContainerPath } from './container-path';

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
  runtimeManager?: RuntimeManager;
}

export async function startManagedDevServer(
  options: StartManagedDevServerOptions,
  deps: StartManagedDevServerDeps = {},
): Promise<StartManagedDevServerResult> {
  const manager = deps.runtimeManager ?? runtimeManager;
  const runtime = await manager.getRuntime(options.workspaceId);
  if (!runtime.capabilities.devServers.start) {
    return { reason: `Managed dev servers are not available for ${runtime.backend} runtime.` };
  }

  const containerCwd = toWorkspaceContainerPath(options.workspacePath, options.cwdPath);
  if (!containerCwd) {
    return {
      reason: `Cannot start a dev server outside the workspace root: ${options.cwdPath}`,
    };
  }

  const framework = options.framework ?? detectFrameworkHint(options.command);
  try {
    const server = await runtime.startDevServer({
      command: options.command,
      cwd: containerCwd,
      name: options.name ?? buildDevServerName(framework),
      framework,
      scope: options.scope === 'card-preview' ? 'card' : options.scope,
      cardId: options.cardId,
      logPath: options.logPath,
    });
    return { serverId: server.id, url: server.url, port: server.port };
  } catch (err) {
    return { reason: err instanceof Error ? err.message : `Failed to start ${options.command}` };
  }
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
