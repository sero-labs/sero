/**
 * Workspace IPC handlers.
 *
 * Bridges renderer ↔ WorkspaceManager in the main process.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { WorkspaceInfo, WorkspaceConfig, WorkspaceRoot, WorkspaceRuntimeConfig } from '@/types/ipc';
import type {
  OpenShellRemoteDiagnosticsIPC,
  RuntimeHealthIPC,
  WorkspaceRuntimeDiagnosticsIPC,
} from '@sero-ai/common';
import { workspaceManager } from '@electron/features/workspace/manager';
import {
  createOpenShellLocalRuntimeAdapter,
  DEFAULT_GATEWAY_NAME,
  getDefaultOpenShellSandboxName,
} from '@electron/features/workspace/runtime/adapters/openshell-local-runtime-adapter';
import { createOpenShellRemoteRuntimeAdapter } from '@electron/features/workspace/runtime/adapters/openshell-remote-runtime-adapter';
import { createOpenShellCloudRuntimeAdapter } from '@electron/features/workspace/runtime/adapters/openshell-cloud-runtime-adapter';
import {
  OpenShellCloudGatewayRegistry,
  type OpenShellCloudGatewayEntry,
} from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';
import {
  OpenShellRemoteGatewayRegistry,
  type OpenShellRemoteGatewayEntry,
  type OpenShellRemoteGatewayInput,
} from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';
import {
  getOpenShellCloudDiagnostics,
  getOpenShellRemoteDiagnostics,
  testOpenShellRemoteGateway,
} from './runtime-diagnostics';
import { getOpenShellPolicyDiagnostics } from '@electron/features/workspace/runtime/openshell/policy-diagnostics';
import { createWorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/runtime-facade';
import { assertIsSeroPluginFolder } from '@electron/features/workspace/plugin-validation';
import { recreateContainerIfRunning } from '@electron/features/workspace/container-sync';
import { appRuntimeManager, containerManager } from '@electron/shared/infra/shared-infra';
import { broadcastToWindows } from '@electron/ipc/lib/window-broadcast';
import { registerOpenShellCloudWorkspaceHandlers } from './openshell-cloud-ipc';

function notifyWorkspaceChanged(): void {
  broadcastToWindows(IpcChannels.workspace.changed);
}

async function reconcileAppRuntimes(reason: string): Promise<void> {
  try {
    await appRuntimeManager.reconcile();
  } catch (err) {
    console.error(`[workspace] Failed to reconcile app runtimes after ${reason}:`, err);
  }
}

async function getRuntimeDiagnostics(
  workspaceId: string,
): Promise<WorkspaceRuntimeDiagnosticsIPC> {
  const runtime = await createWorkspaceRuntimeFacade(workspaceId);
  const runtimeConfig = runtime.resolution.runtimeConfig;
  const providerId = runtime.resolution.providerId ?? runtime.providerId;
  const runtimeHealth = await getRuntimeHealth(runtime, providerId);
  const openShellPolicy = providerId === 'openshell-local'
    ? await getOpenShellPolicyDiagnostics({
      gatewayName: runtimeConfig?.gatewayName ?? DEFAULT_GATEWAY_NAME,
      sandboxName: runtimeConfig?.sandboxName ?? getDefaultOpenShellSandboxName(workspaceId),
      runtimeConfig,
    })
    : undefined;
  const openShellRemote = providerId === 'openshell-remote'
    ? await getOpenShellRemoteDiagnostics(runtimeConfig)
    : undefined;
  const openShellCloud = providerId === 'openshell-cloud'
    ? await getOpenShellCloudDiagnostics(runtimeConfig)
    : undefined;

  return {
    ...runtime.resolution,
    providerId,
    runtimeHealth,
    ...(openShellPolicy ? { openShellPolicy } : {}),
    ...(openShellRemote ? { openShellRemote } : {}),
    ...(openShellCloud ? { openShellCloud } : {}),
  };
}

async function getRuntimeHealth(
  runtime: Awaited<ReturnType<typeof createWorkspaceRuntimeFacade>>,
  providerId: RuntimeHealthIPC['providerId'] = runtime.providerId,
): Promise<RuntimeHealthIPC> {
  if (providerId !== runtime.providerId) {
    return {
      providerId,
      status: 'unavailable',
      message: `${providerId} runtime adapter is not wired yet.`,
    };
  }

  const health = await runtime.health();
  if (runtime.fallbackReason) {
    return {
      providerId: runtime.providerId,
      status: 'fallback',
      message: runtime.fallbackReason,
    };
  }
  return health;
}

interface RuntimeChangeWorkspaceManager {
  getRuntimeConfig?(id: string): Promise<WorkspaceRuntimeConfig | undefined>;
  getPath?(id: string): string | undefined;
}

interface OpenShellRemoteGatewayRegistryReader {
  list(): Promise<OpenShellRemoteGatewayEntry[]>;
}

interface OpenShellCloudGatewayRegistryReader {
  list(): Promise<OpenShellCloudGatewayEntry[]>;
}

interface RuntimeChangeDestroyDeps {
  workspaceManager?: RuntimeChangeWorkspaceManager;
  terminals?: typeof containerManager.terminals;
  openShellRemoteGatewayRegistry?: OpenShellRemoteGatewayRegistryReader;
  openShellCloudGatewayRegistry?: OpenShellCloudGatewayRegistryReader;
}

export async function destroyOpenShellSandboxBeforeRuntimeChange(
  id: string,
  nextRuntime: WorkspaceRuntimeConfig | undefined,
  deps?: RuntimeChangeDestroyDeps,
): Promise<void> {
  const manager = deps?.workspaceManager ?? workspaceManager;
  const currentRuntime = await manager.getRuntimeConfig?.(id);
  if (!isOpenShellRuntimeProvider(currentRuntime?.providerId)) return;
  if (nextRuntime?.providerId === currentRuntime.providerId) return;

  const workspacePath = manager.getPath?.(id);
  if (!workspacePath) throw new Error(`Workspace not found: ${id}`);
  const terminals = deps?.terminals ?? containerManager.terminals;

  try {
    const adapter = currentRuntime.providerId === 'openshell-remote'
      ? createOpenShellRemoteRuntimeAdapter({
          workspaceId: id,
          workspacePath,
          workspaceManager: manager,
          terminals,
          gatewayRegistry: deps?.openShellRemoteGatewayRegistry ?? new OpenShellRemoteGatewayRegistry(),
        })
      : currentRuntime.providerId === 'openshell-cloud'
        ? createOpenShellCloudRuntimeAdapter({
            workspaceId: id,
            workspacePath,
            workspaceManager: manager,
            terminals,
            gatewayRegistry: deps?.openShellCloudGatewayRegistry ?? new OpenShellCloudGatewayRegistry(),
          })
        : createOpenShellLocalRuntimeAdapter({
            workspaceId: id,
            workspacePath,
            workspaceManager: manager,
            terminals,
          });
    await adapter.destroy?.();
  } catch (error) {
    console.error(`[workspace:setRuntime] Failed to destroy OpenShell sandbox for ${id}:`, error);
    if (currentRuntime.providerId === 'openshell-local') throw error;
  }
}

function isOpenShellRuntimeProvider(
  providerId: WorkspaceRuntimeConfig['providerId'] | undefined,
): providerId is 'openshell-local' | 'openshell-remote' | 'openshell-cloud' {
  return providerId === 'openshell-local'
    || providerId === 'openshell-remote'
    || providerId === 'openshell-cloud';
}

export function registerWorkspaceHandlers(): void {
  registerOpenShellCloudWorkspaceHandlers();

  // ── List all registered workspaces ─────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.list,
    async (): Promise<WorkspaceInfo[]> => {
      try {
        return await workspaceManager.list();
      } catch (err) {
        console.error('[workspace:list]', err);
        return [];
      }
    },
  );

  // ── Create a new workspace ──────────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.create,
    async (
      _event,
      name: string,
      parentPath?: string,
      runtime?: WorkspaceRuntimeConfig,
    ): Promise<WorkspaceInfo> => {
      const workspace = await workspaceManager.create(name, parentPath, runtime);
      await reconcileAppRuntimes('workspace create');
      notifyWorkspaceChanged();
      return workspace;
    },
  );

  // ── Unregister a workspace (doesn't delete files) ──────────
  ipcMain.handle(
    IpcChannels.workspace.remove,
    async (_event, id: string): Promise<void> => {
      // Unregister is reversible by re-adding the folder, so OpenShell sandboxes
      // are preserved here. Explicit runtime changes away from OpenShell destroy.
      await workspaceManager.remove(id);
      await reconcileAppRuntimes('workspace remove');
      notifyWorkspaceChanged();
    },
  );

  // ── Get full config for a workspace ────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.getConfig,
    async (_event, id: string): Promise<WorkspaceConfig | null> => {
      return workspaceManager.getConfig(id);
    },
  );

  // ── Register an existing folder as a workspace ─────────────
  ipcMain.handle(
    IpcChannels.workspace.addFolder,
    async (_event, folderPath: string, name?: string): Promise<WorkspaceInfo> => {
      const workspace = await workspaceManager.addFolder(folderPath, name);
      await reconcileAppRuntimes('workspace addFolder');
      notifyWorkspaceChanged();
      return workspace;
    },
  );

  // ── Expand workspace tree node ───────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.open,
    async (_event, id: string): Promise<void> => {
      await workspaceManager.open(id);
      notifyWorkspaceChanged();
    },
  );

  // ── Close workspace (remove from registry) ─────────────────
  ipcMain.handle(
    IpcChannels.workspace.close,
    async (_event, id: string): Promise<void> => {
      // Close only removes the workspace from the sidebar registry, not disk.
      // Keep OpenShell sandboxes so re-adding the folder can continue using them.
      await workspaceManager.close(id);
      await reconcileAppRuntimes('workspace close');
      notifyWorkspaceChanged();
    },
  );

  // ── Set expanded/collapsed state ───────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.setExpanded,
    async (_event, id: string, expanded: boolean): Promise<void> => {
      return workspaceManager.setExpanded(id, expanded);
    },
  );

  // ── Infer workspace from message ─────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.infer,
    async (_event, message: string): Promise<string> => {
      return workspaceManager.inferWorkspace(message);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.runtimeDiagnostics,
    async (_event, workspaceId?: string): Promise<WorkspaceRuntimeDiagnosticsIPC[]> => {
      if (workspaceId) {
        return [await getRuntimeDiagnostics(workspaceId)];
      }
      const workspaces = await workspaceManager.list();
      return Promise.all(workspaces.map((workspace) => getRuntimeDiagnostics(workspace.id)));
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.listOpenShellRemoteGateways,
    async (): Promise<OpenShellRemoteGatewayEntry[]> => {
      return new OpenShellRemoteGatewayRegistry().list();
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.saveOpenShellRemoteGateway,
    async (_event, entry: OpenShellRemoteGatewayInput): Promise<OpenShellRemoteGatewayEntry> => {
      return new OpenShellRemoteGatewayRegistry().upsert(entry);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.removeOpenShellRemoteGateway,
    async (_event, id: string): Promise<void> => {
      await new OpenShellRemoteGatewayRegistry().remove(id);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.testOpenShellRemoteGateway,
    async (_event, entry: OpenShellRemoteGatewayInput): Promise<OpenShellRemoteDiagnosticsIPC> => {
      return testOpenShellRemoteGateway(entry);
    },
  );

  // ── Toggle container mode for a workspace ───────────────────
  ipcMain.handle(
    IpcChannels.workspace.setContainer,
    async (_event, id: string, enabled: boolean): Promise<void> => {
      await destroyOpenShellSandboxBeforeRuntimeChange(id, {
        providerId: enabled ? 'apple-container' : 'host',
      });
      await workspaceManager.setContainerEnabled(id, enabled);
      await reconcileAppRuntimes('workspace legacy container change');
      notifyWorkspaceChanged();
    },
  );

  // ── Set provider-aware runtime config for a workspace ───────
  ipcMain.handle(
    IpcChannels.workspace.setRuntime,
    async (_event, id: string, runtime: WorkspaceRuntimeConfig | undefined): Promise<void> => {
      await destroyOpenShellSandboxBeforeRuntimeChange(id, runtime);
      await workspaceManager.setRuntimeConfig(id, runtime);
      await reconcileAppRuntimes('workspace runtime change');
      notifyWorkspaceChanged();
    },
  );

  // ── Add workspace reference ────────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.addReference,
    async (_event, id: string, refId: string): Promise<void> => {
      await workspaceManager.addReference(id, refId);
      // Recreate the container with the new mount if it's running
      await recreateContainerIfRunning(id);
    },
  );

  // ── Remove workspace reference ────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.removeReference,
    async (_event, id: string, refId: string): Promise<void> => {
      await workspaceManager.removeReference(id, refId);
      await recreateContainerIfRunning(id);
    },
  );

  // ── Add arbitrary folder mount ─────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.addMount,
    async (_event, id: string, folderPath: string): Promise<void> => {
      await workspaceManager.addMount(id, folderPath);
      await recreateContainerIfRunning(id);
    },
  );

  // ── Remove arbitrary folder mount ──────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.removeMount,
    async (_event, id: string, folderPath: string): Promise<void> => {
      await workspaceManager.removeMount(id, folderPath);
      await recreateContainerIfRunning(id);
    },
  );

  // ── Multi-root: list / add / remove / rename ───────────────
  ipcMain.handle(
    IpcChannels.workspace.listRoots,
    async (_event, id: string): Promise<WorkspaceRoot[]> => {
      return workspaceManager.getRoots(id);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.addRoot,
    async (
      _event,
      id: string,
      input: { name: string; path: string; kind?: WorkspaceRoot['kind'] },
    ): Promise<WorkspaceRoot> => {
      // Plugin-folder validation must run in the main process so the IPC
      // API itself rejects "linked-plugin" payloads pointing at folders
      // that are not actually Sero plugins.
      if (input.kind === 'linked-plugin') {
        await assertIsSeroPluginFolder(input.path);
      }
      const root = await workspaceManager.addRoot(id, input);
      // Container parity: roots are merged into bind-mounts at container
      // build time, so recreate the container to pick up the new mount.
      await recreateContainerIfRunning(id);
      return root;
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.removeRoot,
    async (_event, id: string, rootId: string): Promise<void> => {
      await workspaceManager.removeRoot(id, rootId);
      await recreateContainerIfRunning(id);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.renameRoot,
    async (_event, id: string, rootId: string, newName: string): Promise<void> => {
      await workspaceManager.renameRoot(id, rootId, newName);
      // Rename is metadata-only; no container recreation needed.
    },
  );

  // ── Native folder picker dialog ────────────────────────────
  ipcMain.handle(
    IpcChannels.workspace.pickFolder,
    async (): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Add Workspace Folder',
        buttonLabel: 'Add Workspace',
      });

      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
  );
}

