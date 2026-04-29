import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    exec: vi.fn(),
    writeContainerFile: vi.fn(),
    invalidateWorkspace: vi.fn(),
    resolveWorkspaceRuntime: vi.fn().mockResolvedValue({ actualRuntime: 'host', workspacePath: '/repo' }),
    resolveHostPath: vi.fn(async (_workspaceManager: unknown, _workspaceId: string, filePath: string) => `/repo${filePath.replace('/workspace', '')}`),
    resolveContainerPath: vi.fn(),
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    readdir: mocks.readdir,
    stat: mocks.stat,
    rename: mocks.rename,
    rm: mocks.rm,
  },
  existsSync: () => false,
  mkdirSync: vi.fn(),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  containerManager: {
    exec: mocks.exec,
    writeFile: mocks.writeContainerFile,
  },
  workspaceManager: {},
}));

vi.mock('@electron/features/workspace/runtime-resolution', () => ({
  resolveWorkspaceRuntime: mocks.resolveWorkspaceRuntime,
}));

vi.mock('@electron/ipc/editor/path-resolution', () => ({
  PRIMARY_ROOT_PREFIX: '/workspace',
  toHostPath: mocks.resolveHostPath,
  toContainerPath: mocks.resolveContainerPath,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
}));

vi.mock('@electron/features/apps/git-app/manager', () => ({
  gitWorkspaceStateManager: {
    invalidateWorkspace: mocks.invalidateWorkspace,
  },
}));

describe('editor git refresh invalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.mkdir.mockClear();
    mocks.writeFile.mockClear();
    mocks.invalidateWorkspace.mockClear();
    mocks.resolveWorkspaceRuntime.mockClear();
    mocks.resolveWorkspaceRuntime.mockResolvedValue({ actualRuntime: 'host', workspacePath: '/repo' });
  });

  it('invalidates Git refresh after host file saves', async () => {
    const { registerEditorHandlers } = await import('@electron/ipc/editor/editor');

    registerEditorHandlers();

    const writeHandler = mocks.handlers.get(IpcChannels.editor.writeFile);
    expect(writeHandler).toBeTypeOf('function');

    await writeHandler?.({}, 'ws-1', '/workspace/story.txt', 'hello');

    expect(mocks.writeFile).toHaveBeenCalledWith('/repo/story.txt', 'hello', 'utf8');
    expect(mocks.invalidateWorkspace).toHaveBeenCalledWith('ws-1', 'editor:write-file');
  });
});
