import type { DevServer } from '@/types/ipc';
import { seroOwnedProcesses } from '@electron/features/git/worktree/pool/owned-processes';
import { runtimeManager, type RuntimeManager } from './runtime-manager';
import { toRuntimeWorkspacePath } from './runtime-paths';

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

  const runtimeCwd = toRuntimeWorkspacePath(options.workspacePath, options.cwdPath);
  if (!runtimeCwd) {
    return {
      reason: `Cannot start a dev server outside the workspace root: ${options.cwdPath}`,
    };
  }

  const framework = options.framework ?? detectFrameworkHint(options.command);
  try {
    const server = await runtime.startDevServer({
      command: options.command,
      cwd: runtimeCwd,
      name: options.name ?? buildDevServerName(framework),
      framework,
      scope: options.scope === 'card-preview' ? 'card' : options.scope,
      cardId: options.cardId,
      logPath: options.logPath,
    });
    if (server.status === 'failed' || !server.port || !server.url) {
      return { reason: server.diagnosticCode ?? 'Managed dev server failed to start.' };
    }
    if (runtime.backend !== 'host') {
      let unregister: () => void = () => undefined;
      let unsubscribe: () => void = () => undefined;
      const cleanup = (): void => {
        unregister();
        unsubscribe();
      };
      unregister = seroOwnedProcesses.register({
        id: `managed-dev-server:${options.workspaceId}:${server.id}`,
        kind: 'managed-dev-server',
        cwd: options.cwdPath,
        stop: async () => {
          await runtime.stopDevServer({ serverId: server.id });
          cleanup();
        },
      });
      unsubscribe = manager.onDevServerChange((event) => {
        if (event.workspaceId !== options.workspaceId || event.serverId !== server.id) return;
        if (event.type === 'unregistered' || event.status === 'stopped' || event.status === 'failed') cleanup();
      });
    }
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
