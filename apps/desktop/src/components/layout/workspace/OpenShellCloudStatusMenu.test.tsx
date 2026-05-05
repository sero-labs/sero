// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenShellCloudDiagnosticsIPC, WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import type { OpenShellCloudGatewayEntry, OpenShellCloudGatewayInput, WorkspaceInfo } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { OpenShellCloudStatusMenu } from './OpenShellCloudStatusMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();

const gateway: OpenShellCloudGatewayEntry = {
  id: 'openshell-cloud-prod',
  name: 'sero-cloud-prod',
  endpoint: 'https://openshell.example.com',
  authMode: 'browser',
  resourceLabel: '2 CPU / 4 GB RAM',
  cpuLabel: '2 vCPU',
  memoryLabel: '4 GB',
  gpuLabel: 'None',
  costLabel: '$0.20/hr advisory',
  idleTimeoutMinutes: 45,
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

const workspace: WorkspaceInfo = {
  id: 'workspace-cloud',
  name: 'Cloud Workspace',
  path: '/tmp/workspace-cloud',
  open: true,
  container: false,
  references: [],
  mounts: [],
  roots: [],
  runtime: {
    providerId: 'openshell-cloud',
    cloudGatewayId: gateway.id,
    gatewayName: gateway.name,
    sandboxName: 'sero-workspace-cloud',
    idleTimeoutMinutes: 45,
    lastActivityAt: '2026-05-05T01:00:00.000Z',
    experimental: true,
  },
};

function diagnostics(status: OpenShellCloudDiagnosticsIPC['status']): WorkspaceRuntimeDiagnosticsIPC[] {
  return [{
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    desiredRuntime: 'openshell-cloud',
    actualRuntime: 'openshell-cloud',
    containerEnabled: false,
    capabilityAudit: [],
    providerId: 'openshell-cloud',
    runtimeConfig: workspace.runtime,
    openShellCloud: {
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      endpoint: gateway.endpoint,
      sandboxName: 'sero-workspace-cloud',
      latencyMs: 31,
      status,
      message: status === 'ready' ? 'Cloud gateway is ready.' : `Cloud gateway is ${status}.`,
      lastActivityAt: '2026-05-05T01:00:00.000Z',
      idleTimeoutMinutes: 45,
      stale: status === 'stale',
      resourceLabel: gateway.resourceLabel,
      costLabel: gateway.costLabel,
    },
  }];
}

async function openCloudStatusMenu() {
  const trigger = document.querySelector('[title="OpenShell Cloud status"]');
  if (!(trigger instanceof HTMLElement)) throw new Error('Expected OpenShell Cloud status trigger');
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('OpenShellCloudStatusMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const getRuntimeDiagnostics = vi.fn(async () => diagnostics('ready'));
  const listOpenShellCloudGateways = vi.fn(async () => [gateway]);
  const saveOpenShellCloudGateway = vi.fn(async (entry: OpenShellCloudGatewayInput) => ({
    ...entry,
    createdAt: gateway.createdAt,
    updatedAt: gateway.updatedAt,
    idleTimeoutMinutes: entry.idleTimeoutMinutes ?? 60,
  }));
  const loginOpenShellCloudGateway = vi.fn(async () => ({
    status: 'ready' as const,
    message: 'Login completed.',
  }));
  const destroyOpenShellCloudSandbox = vi.fn(async () => undefined);
  const setRuntime = vi.fn(async () => undefined);

  beforeEach(() => {
    getRuntimeDiagnostics.mockClear();
    listOpenShellCloudGateways.mockClear();
    saveOpenShellCloudGateway.mockClear();
    loginOpenShellCloudGateway.mockClear();
    destroyOpenShellCloudSandbox.mockClear();
    setRuntime.mockClear();
    getRuntimeDiagnostics.mockResolvedValue(diagnostics('ready'));
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
          listOpenShellCloudGateways,
          saveOpenShellCloudGateway,
          loginOpenShellCloudGateway,
          destroyOpenShellCloudSandbox,
          setRuntime,
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

  it('shows ready cloud endpoint, auth, sandbox, resource, cost, stale/cost warning, and renderer-safety copy', async () => {
    await act(async () => {
      root?.render(<OpenShellCloudStatusMenu workspace={workspace} />);
    });

    await openCloudStatusMenu();

    expect(getRuntimeDiagnostics).toHaveBeenCalledWith('workspace-cloud');
    expect(document.body.textContent).toContain('Ready');
    expect(document.body.textContent).toContain('https://openshell.example.com');
    expect(document.body.textContent).toContain('Browser login');
    expect(document.body.textContent).toContain('sero-workspace-cloud');
    expect(document.body.textContent).toContain('2 CPU / 4 GB RAM');
    expect(document.body.textContent).toContain('$0.20/hr advisory');
    expect(document.body.textContent).toContain('Cleanup requires a successful sandbox destroy');
    expect(document.body.textContent).toContain('keeps cloud gateway metadata');
  });

  it.each([
    ['auth-required', 'Auth required'],
    ['stale', 'Stale sandbox'],
    ['unavailable', 'Unavailable'],
    ['unsupported', 'Unsupported'],
  ] as const)('maps %s status to clear copy', async (status, label) => {
    getRuntimeDiagnostics.mockResolvedValue(diagnostics(status));
    await act(async () => {
      root?.render(<OpenShellCloudStatusMenu workspace={workspace} />);
    });

    await openCloudStatusMenu();

    expect(document.body.textContent).toContain(label);
    if (status === 'stale') {
      expect(document.body.textContent).toContain('This sandbox appears stale');
    }
  });

  it('logs in through the workspace store action and refreshes diagnostics', async () => {
    await act(async () => {
      root?.render(<OpenShellCloudStatusMenu workspace={workspace} />);
    });
    await openCloudStatusMenu();

    const login = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Login'));
    if (!(login instanceof HTMLButtonElement)) throw new Error('Expected login button');
    await act(async () => {
      login.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(loginOpenShellCloudGateway).toHaveBeenCalledWith('openshell-cloud-prod');
    expect(getRuntimeDiagnostics).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('Login completed.');
  });

  it('destroys only the workspace cloud sandbox and refreshes diagnostics', async () => {
    await act(async () => {
      root?.render(<OpenShellCloudStatusMenu workspace={workspace} />);
    });
    await openCloudStatusMenu();

    const destroy = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Destroy sandbox'));
    if (!(destroy instanceof HTMLButtonElement)) throw new Error('Expected destroy button');
    await act(async () => {
      destroy.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(destroyOpenShellCloudSandbox).toHaveBeenCalledWith('workspace-cloud');
    expect(saveOpenShellCloudGateway).not.toHaveBeenCalled();
    expect(getRuntimeDiagnostics).toHaveBeenCalledTimes(2);
  });

  it('edits cloud metadata through gateway save and workspace runtime config', async () => {
    await act(async () => {
      root?.render(<OpenShellCloudStatusMenu workspace={workspace} />);
    });
    await openCloudStatusMenu();

    const edit = document.querySelector('[title="Edit OpenShell Cloud metadata"]');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Expected edit button');
    await act(async () => {
      edit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const endpoint = document.querySelector('input[placeholder="https://openshell.example.com"]');
    if (!(endpoint instanceof HTMLInputElement)) throw new Error('Expected endpoint input');
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(endpoint, 'https://new.example.com');
      endpoint.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Expected save button');
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(saveOpenShellCloudGateway).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openshell-cloud-prod',
      endpoint: 'https://new.example.com',
      authMode: 'browser',
      idleTimeoutMinutes: 45,
    }));
    expect(setRuntime).toHaveBeenCalledWith('workspace-cloud', expect.objectContaining({
      providerId: 'openshell-cloud',
      cloudGatewayId: 'openshell-cloud-prod',
      gatewayName: 'sero-cloud-prod',
      idleTimeoutMinutes: 45,
    }));
  });
});
