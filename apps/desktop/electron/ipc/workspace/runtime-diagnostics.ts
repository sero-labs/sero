import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import type {
  OpenShellCloudDiagnosticsIPC,
  OpenShellRemoteDiagnosticsIPC,
} from '@sero-ai/common';
import {
  OpenShellCloudGatewayRegistry,
} from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';
import { getCloudGatewayDiagnostics } from '@electron/features/workspace/runtime/openshell/cloud-gateway';
import {
  OpenShellRemoteGatewayRegistry,
  type OpenShellRemoteGatewayInput,
} from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';
import { ensureRemoteGatewayEndpoint } from '@electron/features/workspace/runtime/openshell/remote-gateway';
import {
  getOpenShellRemoteConnectionMode,
  getOpenShellRemoteLocalPort,
} from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';
import { getRemoteTunnelLocalEndpoint } from '@electron/features/workspace/runtime/openshell/remote-tunnel';
import { checkRemoteDocker } from '@electron/features/workspace/runtime/openshell/remote-ssh';

export async function getOpenShellCloudDiagnostics(
  runtimeConfig: WorkspaceRuntimeConfig | undefined,
): Promise<OpenShellCloudDiagnosticsIPC> {
  const gatewayId = runtimeConfig?.cloudGatewayId;
  if (!gatewayId) {
    return {
      gatewayName: runtimeConfig?.gatewayName,
      sandboxName: runtimeConfig?.sandboxName,
      status: 'unavailable',
      message: 'OpenShell Cloud is selected but no cloud gateway is configured for this workspace.',
      lastActivityAt: runtimeConfig?.lastActivityAt,
      idleTimeoutMinutes: runtimeConfig?.idleTimeoutMinutes,
      stale: false,
    };
  }

  try {
    const gateway = (await new OpenShellCloudGatewayRegistry().list())
      .find((entry) => entry.id === gatewayId);
    if (!gateway) {
      return {
        gatewayId,
        gatewayName: runtimeConfig?.gatewayName,
        sandboxName: runtimeConfig?.sandboxName,
        status: 'unavailable',
        message: `OpenShell Cloud gateway ${gatewayId} is not saved in the registry. Select or save a cloud gateway for this workspace.`,
        lastActivityAt: runtimeConfig?.lastActivityAt,
        idleTimeoutMinutes: runtimeConfig?.idleTimeoutMinutes,
        stale: false,
      };
    }

    return getCloudGatewayDiagnostics(gateway, runtimeConfig ?? { providerId: 'openshell-cloud' });
  } catch (error) {
    return {
      gatewayId,
      gatewayName: runtimeConfig?.gatewayName,
      sandboxName: runtimeConfig?.sandboxName,
      status: 'unavailable',
      message: `OpenShell Cloud diagnostics failed: ${formatErrorMessage(error)}`,
      lastActivityAt: runtimeConfig?.lastActivityAt,
      idleTimeoutMinutes: runtimeConfig?.idleTimeoutMinutes,
      stale: false,
    };
  }
}

export async function getOpenShellRemoteDiagnostics(
  runtimeConfig: WorkspaceRuntimeConfig | undefined,
): Promise<OpenShellRemoteDiagnosticsIPC> {
  const gatewayId = runtimeConfig?.remoteGatewayId;
  const sandboxName = runtimeConfig?.sandboxName;
  if (!gatewayId) {
    return {
      gatewayName: runtimeConfig?.gatewayName,
      sandboxName,
      status: 'unavailable',
      message: 'OpenShell Remote is selected but no remote gateway is configured for this workspace.',
    };
  }

  try {
    const gateway = (await new OpenShellRemoteGatewayRegistry().list())
      .find((entry) => entry.id === gatewayId);
    if (!gateway) {
      return {
        gatewayId,
        gatewayName: runtimeConfig?.gatewayName,
        sandboxName,
        status: 'unavailable',
        message: `OpenShell Remote gateway ${gatewayId} is not saved in the registry. Select or save a gateway for this workspace.`,
      };
    }

    return testOpenShellRemoteGateway(gateway, sandboxName);
  } catch (error) {
    return {
      gatewayId,
      gatewayName: runtimeConfig?.gatewayName,
      sandboxName,
      status: 'unavailable',
      message: `OpenShell Remote diagnostics failed: ${formatErrorMessage(error)}`,
    };
  }
}

export async function testOpenShellRemoteGateway(
  entry: OpenShellRemoteGatewayInput,
  sandboxName?: string,
): Promise<OpenShellRemoteDiagnosticsIPC> {
  try {
    const docker = await checkRemoteDocker(entry);
    if (docker.status === 'unsupported') {
      return toOpenShellRemoteDiagnostics(entry, docker.status, docker.message, sandboxName, undefined, {
        diagnosticCode: 'unsupported',
      });
    }

    const startedAt = Date.now();
    const endpoint = await ensureRemoteGatewayEndpoint(entry);
    const status = docker.ok && endpoint.ok ? 'ready' : 'unavailable';
    const message = [docker.message, endpoint.message].filter(Boolean).join(' ');
    return toOpenShellRemoteDiagnostics(
      entry,
      status,
      message || 'OpenShell Remote diagnostics completed.',
      sandboxName,
      endpoint.ok ? Date.now() - startedAt : undefined,
      {
        localEndpoint: endpoint.localEndpoint,
        localPort: endpoint.localPort,
        diagnosticCode: toIpcRemoteDiagnosticCode(endpoint.diagnosticCode),
      },
    );
  } catch (error) {
    return toOpenShellRemoteDiagnostics(
      entry,
      'unavailable',
      `OpenShell Remote diagnostics failed: ${formatErrorMessage(error)}`,
      sandboxName,
    );
  }
}

function toOpenShellRemoteDiagnostics(
  entry: OpenShellRemoteGatewayInput,
  status: OpenShellRemoteDiagnosticsIPC['status'],
  message: string,
  sandboxName?: string,
  latencyMs?: number,
  details: Pick<OpenShellRemoteDiagnosticsIPC, 'localEndpoint' | 'localPort' | 'diagnosticCode'> = {},
): OpenShellRemoteDiagnosticsIPC {
  const connectionMode = getOpenShellRemoteConnectionMode(entry);
  const localPort = details.localPort ?? (
    connectionMode === 'ssh-tunnel' ? getOpenShellRemoteLocalPort(entry) : undefined
  );
  const localEndpoint = details.localEndpoint ?? (
    connectionMode === 'ssh-tunnel' ? getRemoteTunnelLocalEndpoint(entry) : undefined
  );
  return {
    gatewayId: entry.id,
    gatewayName: entry.name,
    sshHost: entry.sshHost,
    sandboxName,
    localEndpoint,
    localPort,
    connectionMode,
    diagnosticCode: details.diagnosticCode,
    latencyMs,
    status,
    message,
  };
}

function toIpcRemoteDiagnosticCode(
  code: 'ssh-auth-failed' | 'local-port-conflict' | 'remote-gateway-not-listening' | 'openshell-status-failed' | 'unsupported' | 'tunnel-exited' | undefined,
): OpenShellRemoteDiagnosticsIPC['diagnosticCode'] {
  return code === 'tunnel-exited' ? 'openshell-status-failed' : code;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
