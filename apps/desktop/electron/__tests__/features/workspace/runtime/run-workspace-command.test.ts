import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  workspaceManager: {
    getPath: vi.fn(),
  },
  containerManager: {
    ensure: vi.fn(),
    exec: vi.fn(),
  },
  resolveWorkspaceRuntime: vi.fn(),
  buildWorkspaceContainerConfig: vi.fn(),
  toWorkspaceContainerPath: vi.fn(),
}));

vi.mock('child_process', () => ({ execFile: mocks.execFileMock }));
vi.mock('util', () => ({ promisify: () => mocks.execFileMock }));
vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: mocks.workspaceManager }));
vi.mock('@electron/features/container/core/singleton', () => ({ containerManager: mocks.containerManager }));
vi.mock('@electron/features/workspace/runtime-resolution', () => ({ resolveWorkspaceRuntime: mocks.resolveWorkspaceRuntime }));
vi.mock('@electron/features/container/core/workspace-container-config', () => ({
  buildWorkspaceContainerConfig: mocks.buildWorkspaceContainerConfig,
}));
vi.mock('@electron/features/workspace/runtime/container-path', () => ({
  toWorkspaceContainerPath: mocks.toWorkspaceContainerPath,
}));

import { runWorkspaceCommand } from '@electron/features/workspace/runtime/run-workspace-command';

describe('runWorkspaceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceManager.getPath.mockReturnValue('/tmp/ws');
    mocks.resolveWorkspaceRuntime.mockResolvedValue({
      desiredRuntime: 'container',
      actualRuntime: 'host',
      fallbackReason: 'falling back to host mode',
    });
    mocks.execFileMock.mockResolvedValue({ stdout: 'host ok', stderr: '' });
  });

  it('falls back to host execution when runtime resolution says host', async () => {
    const result = await runWorkspaceCommand('ws-1', '/tmp/ws', 'pwd');

    expect(result).toEqual({ stdout: 'host ok', stderr: '', exitCode: 0 });
    expect(mocks.containerManager.ensure).not.toHaveBeenCalled();
    expect(mocks.execFileMock).toHaveBeenCalledWith('sh', ['-c', 'pwd'], expect.objectContaining({ cwd: '/tmp/ws' }));
  });

  it('uses the container execution path when runtime resolution says container', async () => {
    mocks.resolveWorkspaceRuntime.mockResolvedValue({
      desiredRuntime: 'container',
      actualRuntime: 'container',
    });
    mocks.buildWorkspaceContainerConfig.mockResolvedValue({ workspaceId: 'ws-1' });
    mocks.toWorkspaceContainerPath.mockReturnValue('/workspace');
    mocks.containerManager.exec.mockResolvedValue({ stdout: 'container ok', stderr: '', exitCode: 0 });

    const result = await runWorkspaceCommand('ws-1', '/tmp/ws', 'pwd');

    expect(mocks.containerManager.ensure).toHaveBeenCalled();
    expect(mocks.containerManager.exec).toHaveBeenCalledWith('ws-1', 'pwd', '/workspace', 120000);
    expect(result).toEqual({ stdout: 'container ok', stderr: '', exitCode: 0 });
  });
});
