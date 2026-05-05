import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { WorkspaceRuntimeResolution } from '@electron/features/workspace/runtime-resolution';

const mocks = vi.hoisted(() => ({
  checkOpenShellPrerequisites: vi.fn(),
  pullWorkspaceFromSandbox: vi.fn(),
  pushWorkspaceToSandbox: vi.fn(),
  runOpenShell: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/health', () => ({
  checkOpenShellPrerequisites: mocks.checkOpenShellPrerequisites,
}));

vi.mock('@electron/features/workspace/runtime/openshell/sync', () => ({
  pullWorkspaceFromSandbox: mocks.pullWorkspaceFromSandbox,
  pushWorkspaceToSandbox: mocks.pushWorkspaceToSandbox,
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', () => ({
  formatOpenShellFailure: (operation: string, result: { stderr: string; stdout: string; exitCode: number }) =>
    `${operation} failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
  runOpenShell: mocks.runOpenShell,
}));

import { createWorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/runtime-facade';

describe('OpenShell Local runtime integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkOpenShellPrerequisites.mockResolvedValue({
      ok: true,
      status: 'ready',
      message: 'OpenShell Local prerequisites are ready.',
      checks: [],
    });
    mocks.pushWorkspaceToSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.pullWorkspaceFromSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('creates a facade, executes through OpenShell, pushes before exec, pulls after exec, and returns output', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'created', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'hello from openshell\n', stderr: '', exitCode: 0 });
    const workspaceManager = createWorkspaceManager();

    const runtime = await createWorkspaceRuntimeFacade('ws-open', {
      deps: {
        resolveWorkspaceRuntime: vi.fn(async () => createOpenShellResolution()),
        workspaceManager,
        containerManager: createContainerManager(),
      },
    });
    const result = await runtime.exec('node -e "console.log(1)"', {
      cwd: '/tmp/ws-open/src',
      timeoutMs: 5_000,
    });

    expect(runtime.providerId).toBe('openshell-local');
    expect(runtime.actualRuntime).toBe('openshell-local');
    expect(result).toEqual({ stdout: 'hello from openshell\n', stderr: '', exitCode: 0 });
    expect(mocks.pushWorkspaceToSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-open',
      workspacePath: '/tmp/ws-open',
      runtimeWorkspacePath: '/workspace/ws-open',
      timeoutMs: 5_000,
    });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(5, [
      '--gateway', 'sero-local',
      'sandbox', 'exec', '-n', 'sero-ws-open',
      '--workdir', '/workspace/ws-open/src',
      '--timeout', '5',
      '--no-tty', '--', 'sh', '-lc', 'node -e "console.log(1)"',
    ], { timeoutMs: 5_000 });
    expect(mocks.pullWorkspaceFromSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-open',
      workspacePath: '/tmp/ws-open',
      runtimeWorkspacePath: '/workspace/ws-open',
      timeoutMs: 5_000,
    });
    expect(workspaceManager.setRuntimeConfig).toHaveBeenCalledWith('ws-open', {
      providerId: 'openshell-local',
      experimental: true,
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-open',
      runtimeWorkspacePath: '/workspace/ws-open',
    });
  });
});

function createOpenShellResolution(): WorkspaceRuntimeResolution {
  return {
    workspaceId: 'ws-open',
    workspacePath: '/tmp/ws-open',
    providerId: 'openshell-local',
    desiredRuntime: 'openshell-local',
    actualRuntime: 'openshell-local',
    containerEnabled: false,
    capabilityAudit: [],
  };
}

function createWorkspaceManager(): WorkspaceManager {
  return {
    getRuntimeConfig: vi.fn(async () => undefined),
    setRuntimeConfig: vi.fn(async () => undefined),
    getReferences: vi.fn(),
    getMounts: vi.fn(),
    getRoots: vi.fn(),
  } as unknown as WorkspaceManager;
}

function createContainerManager(): ContainerManager {
  return {
    terminals: {
      createHostTerminal: vi.fn(),
      createTerminal: vi.fn(),
    },
  } as unknown as ContainerManager;
}
