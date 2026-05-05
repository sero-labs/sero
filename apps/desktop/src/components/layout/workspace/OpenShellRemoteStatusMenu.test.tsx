// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import type { WorkspaceInfo } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { OpenShellRemoteStatusMenu } from './OpenShellRemoteStatusMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();

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

  it('loads and shows remote host, gateway, sandbox, status, latency, and renderer-safety copy', async () => {
    await act(async () => {
      root?.render(<OpenShellRemoteStatusMenu workspace={workspace} />);
    });

    await openRemoteStatusMenu();

    expect(getRuntimeDiagnostics).toHaveBeenCalledWith('workspace-remote');
    expect(document.body.textContent).toContain('OpenShell Remote status');
    expect(document.body.textContent).toContain('Ready');
    expect(document.body.textContent).toContain('Remote gateway is ready.');
    expect(document.body.textContent).toContain('dev@example-host');
    expect(document.body.textContent).toContain('sero-remote-dev');
    expect(document.body.textContent).toContain('sero-workspace-remote');
    expect(document.body.textContent).toContain('42 ms');
    expect(document.body.textContent).toContain('does not run SSH or OpenShell commands in the renderer');
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
  });
});
