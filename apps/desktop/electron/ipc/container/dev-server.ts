/**
 * Dev Server IPC handlers.
 *
 * Exposes the DevServerRegistry to the renderer via IPC and pushes
 * real-time events (registered, unregistered, status_changed) as they occur.
 */

import { ipcMain, shell } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { DevServer, DevServerEvent } from '@/types/ipc';
import { containerManager } from '@electron/shared/infra/shared-infra';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { RuntimeDevServer, RuntimeDevServerChangeEvent } from '@electron/features/workspace/runtime/types';
import { broadcastToWindows } from '../lib/window-broadcast';

/** Push a dev server event to all renderer windows. */
function sendEvent(event: DevServerEvent): void {
  broadcastToWindows(IpcChannels.devServer.event, event);
}

function workspaceIdFromServerId(serverId: string): string {
  return serverId.includes(':') ? (serverId.split(':')[0] ?? '') : '';
}

function runtimeScopeToIpc(scope: RuntimeDevServer['scope']): DevServer['scope'] {
  return scope === 'card' || scope === 'card-preview' ? 'card-preview' : 'workspace';
}

function runtimeStatusToIpc(status: RuntimeDevServer['status']): DevServer['status'] {
  if (status === 'running' || status === 'starting' || status === 'failed') return status;
  return 'stopped';
}

function runtimeDevServerToIpc(workspaceId: string, server: RuntimeDevServer): DevServer {
  return {
    id: server.id,
    workspaceId,
    name: server.name ?? `Dev server :${server.port}`,
    port: server.port,
    url: server.url,
    framework: server.framework,
    command: server.command,
    cwd: server.cwd,
    scope: runtimeScopeToIpc(server.scope),
    cardId: server.cardId,
    status: runtimeStatusToIpc(server.status),
    registeredAt: server.registeredAt ?? new Date().toISOString(),
  };
}

function runtimeDevServerEventToIpc(event: RuntimeDevServerChangeEvent): DevServerEvent | null {
  switch (event.type) {
    case 'registered':
      return event.server ? { type: 'registered', server: runtimeDevServerToIpc(event.workspaceId, event.server) } : null;
    case 'unregistered':
      return event.serverId ? { type: 'unregistered', serverId: event.serverId } : null;
    case 'status_changed':
      return event.serverId ? { type: 'status_changed', serverId: event.serverId, status: runtimeStatusToIpc(event.status) } : null;
  }
}

export function registerDevServerHandlers(): void {
  const registry = containerManager.devServers;

  // Forward legacy and runtime-backend events to the renderer through RuntimeManager.
  runtimeManager.onDevServerChange((event) => {
    const normalized = runtimeDevServerEventToIpc(event);
    if (normalized) sendEvent(normalized);
  });

  // ── List registered dev servers ────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.list,
    async (_event, workspaceId?: string) => {
      if (!workspaceId) {
        return runtimeManager.listAllDevServersSync().map((server) => runtimeDevServerToIpc(server.workspaceId, server));
      }
      return runtimeManager.listDevServersSync(workspaceId).map((server) => runtimeDevServerToIpc(workspaceId, server));
    },
  );

  async function stopRuntimeThenLegacy(serverId: string): Promise<void> {
    const workspaceId = workspaceIdFromServerId(serverId);
    if (workspaceId) {
      try {
        const runtime = await runtimeManager.getRuntime(workspaceId);
        await runtime.stopDevServer({ serverId });
        return;
      } catch (error) {
        if (!registry.get(serverId)) throw error;
      }
    }

    const ok = await registry.stop(serverId);
    if (!ok) throw new Error(`Failed to stop dev server: ${serverId}`);
  }

  async function restartRuntimeThenLegacy(serverId: string): Promise<void> {
    const workspaceId = workspaceIdFromServerId(serverId);
    if (workspaceId) {
      try {
        const runtime = await runtimeManager.getRuntime(workspaceId);
        await runtime.restartDevServer({ serverId });
        return;
      } catch (error) {
        if (!registry.get(serverId)) throw error;
      }
    }

    const ok = await registry.restart(serverId);
    if (!ok) throw new Error(`Failed to restart dev server: ${serverId}`);
  }

  // ── Stop a dev server ──────────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.stop,
    async (_event, serverId: string) => {
      await stopRuntimeThenLegacy(serverId);
    },
  );

  // ── Restart a dev server ───────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.restart,
    async (_event, serverId: string) => {
      await restartRuntimeThenLegacy(serverId);
    },
  );

  // ── Unregister a dev server ────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.unregister,
    async (_event, serverId: string) => {
      const workspaceId = workspaceIdFromServerId(serverId);
      if (workspaceId) {
        const runtime = await runtimeManager.getRuntime(workspaceId);
        if (runtime.listDevServersSync?.().some((server) => server.id === serverId)) {
          await runtime.unregisterDevServer?.({ serverId });
          return;
        }
      }
      registry.unregister(serverId);
    },
  );

  // ── Open in browser ────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.devServer.openInBrowser,
    async (_event, serverId: string) => {
      const workspaceId = workspaceIdFromServerId(serverId);
      const runtimeServer = workspaceId
        ? runtimeManager.listDevServersSync(workspaceId).find((server) => server.id === serverId)
        : undefined;
      const server = runtimeServer ?? registry.get(serverId);
      if (!server) throw new Error(`Dev server not found: ${serverId}`);
      await shell.openExternal(server.url);
    },
  );
}
