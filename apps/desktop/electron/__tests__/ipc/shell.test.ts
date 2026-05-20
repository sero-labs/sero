import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    openExternal: vi.fn(async () => {}),
    openPath: vi.fn(async () => ''),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  shell: {
    openExternal: mocks.openExternal,
    openPath: mocks.openPath,
  },
}));

describe('shell IPC handlers', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.ipcHandle.mockClear();
    mocks.openExternal.mockClear();
    mocks.openPath.mockClear();

    const { registerShellHandlers } = await import('@electron/ipc/platform/system/shell');
    registerShellHandlers();
  });

  it('opens allowed external web URLs', async () => {
    const handler = mocks.handlers.get(IpcChannels.shell.openExternal);
    if (!handler) throw new Error('Expected shell.openExternal handler');

    await handler({}, 'https://example.com');
    await handler({}, 'http://localhost:5173');

    expect(mocks.openExternal).toHaveBeenCalledTimes(2);
    expect(mocks.openExternal).toHaveBeenNthCalledWith(1, 'https://example.com');
    expect(mocks.openExternal).toHaveBeenNthCalledWith(2, 'http://localhost:5173');
  });

  it.each([
    'file:///tmp/index.html',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'not a url',
    '',
    42,
  ])('blocks disallowed external URL %s', async (url) => {
    const handler = mocks.handlers.get(IpcChannels.shell.openExternal);
    if (!handler) throw new Error('Expected shell.openExternal handler');

    await expect(handler({}, url)).rejects.toThrow('Blocked external URL.');
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});
