import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import type { OpenShellCloudDiagnosticsIPC } from '@sero-ai/common';
import { containerManager } from '@electron/shared/infra/shared-infra';
import { workspaceManager } from '@electron/features/workspace/manager';
import { createOpenShellCloudRuntimeAdapter } from '@electron/features/workspace/runtime/adapters/openshell-cloud-runtime-adapter';
import {
  getCloudGatewayDiagnostics,
  loginCloudGateway,
  registerCloudGateway,
} from '@electron/features/workspace/runtime/openshell/cloud-gateway';
import {
  OpenShellCloudGatewayRegistry,
  type OpenShellCloudGatewayEntry,
  type OpenShellCloudGatewayInput,
} from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';

export function registerOpenShellCloudWorkspaceHandlers(): void {
  ipcMain.handle(
    IpcChannels.workspace.listOpenShellCloudGateways,
    async (): Promise<OpenShellCloudGatewayEntry[]> => {
      return new OpenShellCloudGatewayRegistry().list();
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.saveOpenShellCloudGateway,
    async (_event, entry: OpenShellCloudGatewayInput): Promise<OpenShellCloudGatewayEntry> => {
      return new OpenShellCloudGatewayRegistry().upsert(entry);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.removeOpenShellCloudGateway,
    async (_event, id: string): Promise<void> => {
      await new OpenShellCloudGatewayRegistry().remove(id);
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.testOpenShellCloudGateway,
    async (_event, entry: OpenShellCloudGatewayInput): Promise<OpenShellCloudDiagnosticsIPC> => {
      const registered = await registerCloudGateway(entry);
      if (!registered.ok) return toCloudDiagnostics(entry, registered.status, registered.message);
      return getCloudGatewayDiagnostics(entryToDiagnosticsEntry(entry), toTestRuntimeConfig(entry));
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.loginOpenShellCloudGateway,
    async (_event, id: string): Promise<OpenShellCloudDiagnosticsIPC> => {
      const gateway = await findCloudGateway(id);
      if (!gateway) {
        return {
          gatewayId: id,
          status: 'unavailable',
          message: `OpenShell Cloud gateway ${id} is not saved in the registry.`,
          stale: false,
        };
      }

      const login = await loginCloudGateway(gateway);
      if (!login.ok) return toCloudDiagnostics(gateway, login.status, login.message);
      return getCloudGatewayDiagnostics(gateway, toTestRuntimeConfig(gateway));
    },
  );

  ipcMain.handle(
    IpcChannels.workspace.destroyOpenShellCloudSandbox,
    async (_event, workspaceId: string): Promise<void> => {
      const workspacePath = workspaceManager.getPath(workspaceId);
      if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
      const adapter = createOpenShellCloudRuntimeAdapter({
        workspaceId,
        workspacePath,
        workspaceManager,
        terminals: containerManager.terminals,
        gatewayRegistry: new OpenShellCloudGatewayRegistry(),
      });
      await adapter.destroy?.();
    },
  );
}

async function findCloudGateway(id: string): Promise<OpenShellCloudGatewayEntry | undefined> {
  const gateways = await new OpenShellCloudGatewayRegistry().list();
  return gateways.find((gateway) => gateway.id === id);
}

function toCloudDiagnostics(
  entry: Pick<OpenShellCloudGatewayInput, 'id' | 'name' | 'endpoint' | 'resourceLabel' | 'costLabel' | 'idleTimeoutMinutes'>,
  status: OpenShellCloudDiagnosticsIPC['status'],
  message: string,
): OpenShellCloudDiagnosticsIPC {
  return {
    gatewayId: entry.id,
    gatewayName: entry.name,
    endpoint: entry.endpoint,
    status,
    message,
    idleTimeoutMinutes: entry.idleTimeoutMinutes,
    stale: false,
    resourceLabel: entry.resourceLabel,
    costLabel: entry.costLabel,
  };
}

function toTestRuntimeConfig(entry: OpenShellCloudGatewayInput): WorkspaceRuntimeConfig {
  return {
    providerId: 'openshell-cloud',
    cloudGatewayId: entry.id,
    gatewayName: entry.name,
    idleTimeoutMinutes: entry.idleTimeoutMinutes,
  };
}

function entryToDiagnosticsEntry(entry: OpenShellCloudGatewayInput): OpenShellCloudGatewayEntry {
  const now = new Date().toISOString();
  return {
    ...entry,
    idleTimeoutMinutes: entry.idleTimeoutMinutes ?? 60,
    createdAt: now,
    updatedAt: now,
  };
}
