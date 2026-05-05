import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/types';
import { startManagedDevServer } from '@electron/features/workspace/runtime/start-managed-dev-server';

function createRuntime(overrides: Partial<WorkspaceRuntimeFacade> = {}): WorkspaceRuntimeFacade {
  return {
    workspaceId: 'workspace-1',
    workspacePath: '/tmp/workspace',
    providerId: 'apple-container',
    actualRuntime: 'container',
    resolution: {
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace',
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled: true,
      providerId: 'apple-container',
      capabilityAudit: [],
    },
    capabilities: {
      exec: true,
      interactiveTerminal: true,
      directFileRead: true,
      directFileWrite: true,
      fileUpload: true,
      fileDownload: true,
      managedDevServers: true,
      browserAutomation: true,
      portDiscovery: true,
      portForward: false,
      logStream: false,
    },
    health: vi.fn(),
    exec: vi.fn(),
    createTerminal: vi.fn(),
    ...overrides,
  } as WorkspaceRuntimeFacade;
}

describe('startManagedDevServer', () => {
  it('preserves Apple container port-scanner startup flow', async () => {
    const ensureContainer = vi.fn().mockResolvedValue(undefined);
    const getPorts = vi.fn()
      .mockReturnValueOnce([{ port: 3000, url: 'http://container:3000' }])
      .mockReturnValueOnce([
        { port: 3000, url: 'http://container:3000' },
        { port: 5173, url: 'http://container:5173' },
      ]);
    const triggerScan = vi.fn();
    const execInContainer = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const registerServer = vi.fn((params) => ({
      id: 'workspace-1:workspace:root:5173',
      status: 'running',
      registeredAt: 'now',
      url: 'http://container:5173',
      ...params,
    }));

    const result = await startManagedDevServer({
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace',
      command: 'pnpm vite --host 0.0.0.0',
    }, {
      createRuntime: vi.fn().mockResolvedValue(createRuntime()),
      ensureContainer,
      getPorts,
      triggerScan,
      execInContainer,
      registerServer,
    });

    expect(ensureContainer).toHaveBeenCalledWith('workspace-1', '/tmp/workspace');
    expect(execInContainer).toHaveBeenCalledWith(
      'workspace-1',
      "setsid sh -c 'pnpm vite --host 0.0.0.0 > /tmp/sero-dev-server.log 2>&1 &'",
      '/workspace',
      30_000,
    );
    expect(triggerScan).toHaveBeenCalledWith('workspace-1');
    expect(registerServer).toHaveBeenCalledWith(expect.objectContaining({
      port: 5173,
      cwd: '/workspace',
      framework: 'vite',
    }));
    expect(result).toMatchObject({
      serverId: 'workspace-1:workspace:root:5173',
      url: 'http://container:5173',
      port: 5173,
    });
  });

  it('starts and forwards an OpenShell managed dev server without port discovery', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const forwardPort = vi.fn().mockResolvedValue({
      runtimePort: 5173,
      localPort: 5173,
      localUrl: 'http://127.0.0.1:5173',
      status: 'ready',
    });
    const getPorts = vi.fn();
    const triggerScan = vi.fn();
    const registerServer = vi.fn((params) => ({
      id: 'workspace-1:workspace:root:5173',
      status: 'running',
      registeredAt: 'now',
      ...params,
    }));

    const result = await startManagedDevServer({
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace',
      command: 'pnpm vite --host 0.0.0.0',
    }, {
      createRuntime: vi.fn().mockResolvedValue(createRuntime({
        providerId: 'openshell-local',
        actualRuntime: 'openshell-local',
        capabilities: {
          exec: true,
          interactiveTerminal: false,
          directFileRead: false,
          directFileWrite: false,
          fileUpload: true,
          fileDownload: true,
          managedDevServers: true,
          browserAutomation: false,
          portDiscovery: false,
          portForward: true,
          logStream: true,
        },
        exec,
        forwardPort,
      })),
      getPorts,
      triggerScan,
      registerServer,
    });

    expect(exec).toHaveBeenCalledWith(
      "setsid sh -c 'pnpm vite --host 0.0.0.0 > /tmp/sero-dev-server.log 2>&1 &'",
      { cwd: '/tmp/workspace', timeoutMs: 30_000 },
    );
    expect(forwardPort).toHaveBeenCalledWith(5173);
    expect(getPorts).not.toHaveBeenCalled();
    expect(triggerScan).not.toHaveBeenCalled();
    expect(registerServer).toHaveBeenCalledWith(expect.objectContaining({
      port: 5173,
      url: 'http://127.0.0.1:5173',
      cwd: '/tmp/workspace',
      framework: 'vite',
    }));
    expect(result).toEqual({
      serverId: 'workspace-1:workspace:root:5173',
      url: 'http://127.0.0.1:5173',
      port: 5173,
    });
  });

  it('returns a clear reason when OpenShell preview port cannot be inferred', async () => {
    const result = await startManagedDevServer({
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace',
      cwdPath: '/tmp/workspace',
      command: 'pnpm custom-preview',
    }, {
      createRuntime: vi.fn().mockResolvedValue(createRuntime({
        providerId: 'openshell-local',
        actualRuntime: 'openshell-local',
        capabilities: {
          exec: true,
          interactiveTerminal: false,
          directFileRead: false,
          directFileWrite: false,
          fileUpload: true,
          fileDownload: true,
          managedDevServers: true,
          browserAutomation: false,
          portDiscovery: false,
          portForward: true,
          logStream: true,
        },
        exec: vi.fn(),
        forwardPort: vi.fn(),
      })),
    });

    expect(result.reason).toBe('Cannot infer a preview port for "pnpm custom-preview". Specify an explicit port for OpenShell Local previews.');
  });
});
