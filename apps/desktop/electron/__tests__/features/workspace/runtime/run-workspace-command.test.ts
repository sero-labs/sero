import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
  },
  runtimeManager: {
    getRuntime: vi.fn(),
  },
  containerManager: {
    ensure: vi.fn(),
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: mocks.workspaceManager }));
vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({ runtimeManager: mocks.runtimeManager }));
vi.mock('@electron/features/container/core/singleton', () => ({ containerManager: mocks.containerManager }));

import { containerManager } from '@electron/features/container/core/singleton';
import { runWorkspaceCommand } from '@electron/features/workspace/runtime/run-workspace-command';

describe('runWorkspaceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceManager.getPath.mockReturnValue('/tmp/ws');
  });

  it('routes host workspace commands through runtime exec with a runtime cwd', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'host ok', stderr: '', exitCode: 0 });
    mocks.runtimeManager.getRuntime.mockResolvedValue({ exec });

    const result = await runWorkspaceCommand('ws-1', '/tmp/ws', 'pwd');

    expect(mocks.runtimeManager.getRuntime).toHaveBeenCalledWith('ws-1');
    expect(exec).toHaveBeenCalledWith({ command: 'pwd', cwd: '/workspace', timeoutMs: 120000 });
    expect(result).toEqual({ stdout: 'host ok', stderr: '', exitCode: 0 });
  });

  it('routes docker workspace commands through runtime exec without ensuring a legacy container', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'docker ok', stderr: '', exitCode: 0 });
    mocks.runtimeManager.getRuntime.mockResolvedValue({ exec });

    const result = await runWorkspaceCommand('ws-1', '/tmp/ws/app', 'pnpm test', 5000, { isolated: true });

    expect(mocks.runtimeManager.getRuntime).toHaveBeenCalledWith('ws-1');
    expect(exec).toHaveBeenCalledWith({ command: 'pnpm test', cwd: '/workspace/app', timeoutMs: 5000 });
    expect(containerManager.ensure).not.toHaveBeenCalled();
    expect(result).toEqual({ stdout: 'docker ok', stderr: '', exitCode: 0 });
  });

  it('rejects cwd values outside the workspace root before runtime execution', async () => {
    const result = await runWorkspaceCommand('ws-1', '/tmp/elsewhere', 'pwd');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Cannot run command outside workspace root: /tmp/elsewhere',
      exitCode: 1,
    });
    expect(mocks.runtimeManager.getRuntime).not.toHaveBeenCalled();
  });

  it('returns a non-throwing result when the workspace is missing', async () => {
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    const result = await runWorkspaceCommand('missing', '/tmp/ws', 'pwd');

    expect(result).toEqual({ stdout: '', stderr: 'Workspace not found: missing', exitCode: 1 });
    expect(mocks.runtimeManager.getRuntime).not.toHaveBeenCalled();
  });

  it('converts runtime execution failures into exit code 1 results', async () => {
    mocks.runtimeManager.getRuntime.mockResolvedValue({
      exec: vi.fn().mockRejectedValue(new Error('runtime failed')),
    });

    const result = await runWorkspaceCommand('ws-1', '/tmp/ws', 'pwd');

    expect(result).toEqual({ stdout: '', stderr: 'runtime failed', exitCode: 1 });
  });
});
