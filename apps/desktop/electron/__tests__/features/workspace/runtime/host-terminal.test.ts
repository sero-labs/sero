import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ptySpawn: vi.fn(),
}));

vi.mock('@electron/shared/lib/native-pty', () => ({
  loadNodePty: () => ({ spawn: mocks.ptySpawn }),
}));

import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';

class MockPty extends EventEmitter {
  pid = 123;
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();
  onData = vi.fn(() => ({ dispose: vi.fn() }));
  onExit = vi.fn(() => ({ dispose: vi.fn() }));
}

describe('HostBackend terminal creation', () => {
  it('spawns posix terminals with substrate-rendered argv', async () => {
    const pty = new MockPty();
    mocks.ptySpawn.mockReturnValue(pty);
    const workspacePath = '/home/me/repo';
    const backend = new HostBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: workspacePath,
      substrate: createPosixHostSubstrate({ platform: 'linux' }),
    });

    await backend.createTerminal({ terminalId: 'term-1', cwd: '/workspace', cols: 100, rows: 30 });

    expect(mocks.ptySpawn).toHaveBeenCalledWith(expect.any(String), ['--login'], expect.objectContaining({
      cols: 100,
      rows: 30,
      cwd: workspacePath,
    }));
  });
});
