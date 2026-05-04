import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/types';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
  },
  containerManager: {
    ensure: vi.fn(),
    exec: vi.fn(),
  },
  createWorkspaceRuntimeFacade: vi.fn(),
}));

vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: mocks.workspaceManager }));
vi.mock('@electron/features/container/core/singleton', () => ({ containerManager: mocks.containerManager }));
vi.mock('@electron/features/workspace/runtime/runtime-facade', () => ({
  createWorkspaceRuntimeFacade: mocks.createWorkspaceRuntimeFacade,
}));

import { runWorkspaceCommand } from '@electron/features/workspace/runtime/run-workspace-command';

describe('runWorkspaceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceManager.getPath.mockReturnValue('/tmp/ws');
    mocks.createWorkspaceRuntimeFacade.mockResolvedValue(
      createRuntimeFacade({
        desiredRuntime: 'container',
        actualRuntime: 'host',
        fallbackReason: 'falling back to host mode',
        execResult: { stdout: 'host ok', stderr: '', exitCode: 0 },
      }),
    );
  });

  it('falls back to facade host execution when runtime resolution says host', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await runWorkspaceCommand('ws-1', '/tmp/ws', 'pwd');

    expect(result).toEqual({ stdout: 'host ok', stderr: '', exitCode: 0 });
    expect(mocks.createWorkspaceRuntimeFacade).toHaveBeenCalledWith('ws-1');
    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();
    expect(mocks.containerManager.exec).not.toHaveBeenCalled();
    const runtime = await mocks.createWorkspaceRuntimeFacade.mock.results[0].value;
    expect(runtime.exec).toHaveBeenCalledWith('pwd', {
      cwd: '/tmp/ws',
      timeoutMs: 120000,
      isolated: undefined,
    });
    expect(warnSpy).toHaveBeenCalledWith('[workspace-command-runner] falling back to host mode');
    warnSpy.mockRestore();
  });

  it('uses facade container execution and preserves cwd timeout options at the adapter boundary', async () => {
    const runtime = createRuntimeFacade({
      desiredRuntime: 'container',
      actualRuntime: 'container',
      execResult: { stdout: 'container ok', stderr: '', exitCode: 0 },
    });
    mocks.createWorkspaceRuntimeFacade.mockResolvedValue(runtime);

    const result = await runWorkspaceCommand('ws-1', '/tmp/ws/src', 'pnpm test', 5_000, {
      isolated: true,
    });

    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();
    expect(runtime.exec).toHaveBeenCalledWith('pnpm test', {
      cwd: '/tmp/ws/src',
      timeoutMs: 5000,
      isolated: true,
    });
    expect(result).toEqual({ stdout: 'container ok', stderr: '', exitCode: 0 });
  });

  it('returns workspace not found without creating a runtime facade', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    const result = await runWorkspaceCommand('missing-ws', '/tmp/missing', 'pwd');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Workspace not found: missing-ws',
      exitCode: 1,
    });
    expect(mocks.createWorkspaceRuntimeFacade).not.toHaveBeenCalled();
  });

  it('preserves container outside-workspace cwd errors returned by the facade adapter', async () => {
    const outsideWorkspaceResult = {
      stdout: '',
      stderr: 'Cannot run command outside workspace root in container mode: /tmp/outside',
      exitCode: 1,
    };
    mocks.createWorkspaceRuntimeFacade.mockResolvedValue(
      createRuntimeFacade({
        desiredRuntime: 'container',
        actualRuntime: 'container',
        execResult: outsideWorkspaceResult,
      }),
    );

    const result = await runWorkspaceCommand('ws-1', '/tmp/outside', 'pwd');

    expect(result).toEqual(outsideWorkspaceResult);
  });
});

function createRuntimeFacade(input: {
  desiredRuntime: 'host' | 'container';
  actualRuntime: 'host' | 'container';
  fallbackReason?: string;
  execResult: { stdout: string; stderr: string; exitCode: number };
}): WorkspaceRuntimeFacade {
  return {
    workspaceId: 'ws-1',
    workspacePath: '/tmp/ws',
    providerId: input.actualRuntime === 'container' ? 'apple-container' : 'host',
    actualRuntime: input.actualRuntime,
    fallbackReason: input.fallbackReason,
    capabilities: {
      exec: true,
      interactiveTerminal: true,
      directFileRead: input.actualRuntime === 'host',
      directFileWrite: input.actualRuntime === 'host',
      managedDevServers: input.actualRuntime === 'container',
      browserAutomation: input.actualRuntime === 'container',
      portDiscovery: input.actualRuntime === 'container',
    },
    resolution: {
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      desiredRuntime: input.desiredRuntime,
      actualRuntime: input.actualRuntime,
      containerEnabled: input.desiredRuntime === 'container',
      fallbackReason: input.fallbackReason,
      fallbackCode: input.fallbackReason ? 'container_unavailable' : undefined,
      capabilityAudit: [],
    },
    health: vi.fn(),
    exec: vi.fn(async () => input.execResult),
    createTerminal: vi.fn(),
  };
}
