// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import type { OpenShellRemoteGatewayEntry, WorkspaceInfo } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { OpenShellRemoteStatusMenu } from './OpenShellRemoteStatusMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();

const gateway: OpenShellRemoteGatewayEntry = {
  id: 'gateway-1',
  name: 'sero-remote-dev',
  sshHost: 'dev@example-host',
  sshKeyPath: '/Users/me/.ssh/id_ed25519',
  port: 18080,
  gatewayHost: '203.0.113.10',
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

const workspace: WorkspaceInfo = {
  id: 'workspace-remote',
  name: 'Remote Workspace',
  path: '/tmp/workspace-remote',
  open: true,
  container: false,
  references: [],
  mounts: [],
  roots: [],
  runtime: {
    providerId: 'openshell-remote',
    remoteGatewayId: 'gateway-1',
    gatewayName: 'sero-remote-dev',
    sandboxName: 'sero-workspace-remote',
    experimental: true,
  },
};

async function openRemoteStatusMenu() {
  const trigger = document.querySelector('[title="OpenShell Remote status"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('Expected OpenShell Remote status trigger');
  }

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('OpenShellRemoteStatusMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const getRuntimeDiagnostics = vi.fn(async (): Promise<WorkspaceRuntimeDiagnosticsIPC[]> => [{
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    desiredRuntime: 'openshell-remote' as const,
    actualRuntime: 'openshell-remote' as const,
    containerEnabled: false,
    capabilityAudit: [],
    providerId: 'openshell-remote' as const,
    runtimeConfig: workspace.runtime,
    openShellRemote: {
      gatewayId: 'gateway-1',
      gatewayName: 'sero-remote-dev',
      sshHost: 'dev@example-host',
      sandboxName: 'sero-workspace-remote',
      localEndpoint: 'https://127.0.0.1:18080',
      localPort: 18080,
      connectionMode: 'ssh-tunnel' as const,
      latencyMs: 42,
      status: 'ready' as const,
      message: 'Remote gateway is ready.',
    },
  }]);

  beforeEach(() => {
    getRuntimeDiagnostics.mockClear();
    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
    }, true);

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        workspace: {
          getRuntimeDiagnostics,
          listOpenShellRemoteGateways: vi.fn(async () => [gateway]),
          saveOpenShellRemoteGateway: vi.fn(async (entry: OpenShellRemoteGatewayEntry) => ({
            ...entry,
            createdAt: gateway.createdAt,
            updatedAt: gateway.updatedAt,
          })),
          setRuntime: vi.fn(async () => undefined),
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    Reflect.deleteProperty(window, 'sero');
    useWorkspaceStore.setState(initialWorkspaceState, true);
  });

  it('loads and shows remote tunnel endpoint, host, gateway, sandbox, status, latency, and renderer-safety copy', async () => {
    await act(async () => {
      root?.render(<OpenShellRemoteStatusMenu workspace={workspace} />);
    });

    await openRemoteStatusMenu();

    expect(getRuntimeDiagnostics).toHaveBeenCalledWith('workspace-remote');
    expect(document.body.textContent).toContain('OpenShell Remote status');
    expect(document.body.textContent).toContain('Ready');
    expect(document.body.textContent).toContain('Remote gateway is ready.');
    expect(document.body.textContent).toContain('Sero-managed SSH tunnel');
    expect(document.body.textContent).toContain('https://127.0.0.1:18080');
    expect(document.body.textContent).toContain('dev@example-host');
    expect(document.body.textContent).toContain('sero-remote-dev');
    expect(document.body.textContent).toContain('sero-workspace-remote');
    expect(document.body.textContent).toContain('42 ms');
    expect(document.body.textContent).toContain('remote gateway port does not need a public firewall rule');
    expect(document.body.textContent).toContain('never runs SSH or OpenShell commands in the renderer');
  });

  it('refreshes through workspace diagnostics and shows unsupported copy', async () => {
    getRuntimeDiagnostics.mockResolvedValue([{
      workspaceId: workspace.id,
      workspacePath: workspace.path,
      desiredRuntime: 'openshell-remote' as const,
      actualRuntime: 'openshell-remote' as const,
      containerEnabled: false,
      capabilityAudit: [],
      providerId: 'openshell-remote' as const,
      runtimeConfig: workspace.runtime,
      openShellRemote: {
        gatewayName: 'cloud-endpoint',
        status: 'unsupported' as const,
        diagnosticCode: 'unsupported' as const,
        connectionMode: 'ssh-tunnel' as const,
        message: 'Endpoint/cloud gateways are Phase 5. Configure an SSH destination like user@host.',
      },
    }]);

    await act(async () => {
      root?.render(<OpenShellRemoteStatusMenu workspace={workspace} />);
    });

    await openRemoteStatusMenu();
    const refresh = document.querySelector('[title="Refresh OpenShell Remote diagnostics"]');
    if (!(refresh instanceof HTMLButtonElement)) {
      throw new Error('Expected refresh button');
    }

    await act(async () => {
      refresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(getRuntimeDiagnostics).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('Unsupported');
    expect(document.body.textContent).toContain('Endpoint/cloud gateways are Phase 5');
    expect(document.body.textContent).toContain('Missing SSH destination');
    expect(document.body.textContent).toContain('This remote gateway configuration is unsupported');
  });

  it('shows actionable local port conflict diagnostics', async () => {
    getRuntimeDiagnostics.mockResolvedValue([{
      workspaceId: workspace.id,
      workspacePath: workspace.path,
      desiredRuntime: 'openshell-remote' as const,
      actualRuntime: 'openshell-remote' as const,
      containerEnabled: false,
      capabilityAudit: [],
      providerId: 'openshell-remote' as const,
      runtimeConfig: workspace.runtime,
      openShellRemote: {
        gatewayId: 'gateway-1',
        gatewayName: 'sero-remote-dev',
        sshHost: 'dev@example-host',
        sandboxName: 'sero-workspace-remote',
        localEndpoint: 'https://127.0.0.1:18080',
        localPort: 18080,
        connectionMode: 'ssh-tunnel' as const,
        diagnosticCode: 'local-port-conflict' as const,
        status: 'unavailable' as const,
        message: 'Local SSH tunnel port 127.0.0.1:18080 is already in use.',
      },
    }]);

    await act(async () => {
      root?.render(<OpenShellRemoteStatusMenu workspace={workspace} />);
    });

    await openRemoteStatusMenu();

    expect(document.body.textContent).toContain('Local port conflict on 127.0.0.1:18080');
    expect(document.body.textContent).toContain('Stop that process or change the local port');
  });
});
