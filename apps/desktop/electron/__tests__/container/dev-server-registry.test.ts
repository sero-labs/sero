import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevServerRegistry } from '../../container/dev-server-registry';

afterEach(() => {
  vi.useRealTimers();
});

describe('DevServerRegistry', () => {
  it('restarts card previews from their registered worktree cwd', async () => {
    vi.useFakeTimers();

    let ssReads = 0;
    const exec = vi.fn().mockImplementation(async (_workspaceId: string, command: string, cwd?: string) => {
      if (command.includes('ss -tlnp sport = :4173')) {
        ssReads += 1;
        return { stdout: ssReads === 1 ? '123\n' : '', stderr: '', exitCode: 0 };
      }
      if (command.includes("cat /proc/123/stat")) {
        return { stdout: '456\n', stderr: '', exitCode: 0 };
      }
      if (command.includes('kill -TERM -- -456')) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (command.includes("setsid sh -c 'pnpm run dev")) {
        return { stdout: cwd ?? '', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const registry = new DevServerRegistry(
      {
        getPorts: vi.fn().mockReturnValue([
          { port: 4173, url: 'http://127.0.0.1:4173' },
        ]),
        getIp: vi.fn().mockReturnValue('127.0.0.1'),
        triggerScan: vi.fn(),
      } as never,
      { exec } as never,
    );
    const server = registry.register({
      workspaceId: 'workspace-1',
      name: 'Card #9 Preview',
      port: 4173,
      command: 'pnpm run dev',
      cwd: '/workspace/.sero/worktrees/card-9',
      scope: 'card-preview',
      cardId: '9',
    });

    const restartPromise = registry.restart(server.id);
    await vi.runAllTimersAsync();

    await expect(restartPromise).resolves.toBe(true);
    expect(server.id).toBe('workspace-1:card-preview:9:4173');
    expect(exec).toHaveBeenCalledWith(
      'workspace-1',
      expect.stringContaining("setsid sh -c 'pnpm run dev"),
      '/workspace/.sero/worktrees/card-9',
    );
  });
});
