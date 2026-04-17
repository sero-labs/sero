import { describe, expect, it, vi } from 'vitest';

import type { GitRunner } from '@electron/features/vcs/core/git-runner';
import { VcsManager } from '@electron/features/vcs/core/vcs-manager';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

function ok(stdout = '', stderr = '') {
  return { exitCode: 0, stdout, stderr };
}

describe('VcsManager checkpoint source handling', () => {
  it('keeps filesystem checkpoint sources instead of rewriting them to manual', async () => {
    const run = vi.fn(async (_workspaceId: string, args: string[]) => {
      const command = args.join(' ');

      if (command === 'status --porcelain') {
        return ok(' M README.md\n');
      }
      if (command === 'add -A') {
        return ok();
      }
      if (args[0] === 'commit' && args[1] === '-m') {
        return ok('[main 123abc] checkpoint');
      }
      if (command === 'rev-parse --short=12 HEAD') {
        return ok('123abc\n');
      }

      throw new Error(`Unexpected git command: ${command}`);
    });

    const runner = {
      ensureRepoInitialized: vi.fn().mockResolvedValue(undefined),
      run,
    } as unknown as GitRunner;

    const workspaceManager = {
      getPath: vi.fn().mockReturnValue('/tmp/ws-1'),
    } as unknown as WorkspaceManager;

    const manager = new VcsManager(workspaceManager, runner);

    const checkpoint = await manager.createCheckpoint('ws-1', { source: 'fs' });

    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.source).toBe('fs');
    expect(checkpoint?.description.startsWith('checkpoint: filesystem change @')).toBe(true);
    expect(run).toHaveBeenCalledWith(
      'ws-1',
      ['commit', '-m', checkpoint?.description ?? ''],
    );
  });

  it('removes tracked files that were added after the restore target', async () => {
    const run = vi.fn(async (_workspaceId: string, args: string[]) => {
      const command = args.join(' ');

      if (command === 'diff --name-only --diff-filter=A target123 HEAD -- .') {
        return ok('joke.txt\nnotes/extra.md\n');
      }
      if (command === 'checkout target123 -- .') {
        return ok();
      }
      if (command === 'rm -f -- joke.txt') {
        return ok();
      }
      if (command === 'rm -f -- notes/extra.md') {
        return ok();
      }
      if (command === 'clean -fd') {
        return ok();
      }
      if (command === 'add -A') {
        return ok();
      }
      if (command === 'status --porcelain') {
        return ok('D  joke.txt\n');
      }
      if (command === 'commit -m restore: target123') {
        return ok('[main 456def] restore');
      }

      throw new Error(`Unexpected git command: ${command}`);
    });

    const runner = {
      ensureRepoInitialized: vi.fn().mockResolvedValue(undefined),
      run,
    } as unknown as GitRunner;

    const workspaceManager = {
      getPath: vi.fn().mockReturnValue('/tmp/ws-1'),
    } as unknown as WorkspaceManager;

    const manager = new VcsManager(workspaceManager, runner);

    await manager.restoreCheckpoint('ws-1', 'target123');

    expect(run).toHaveBeenCalledWith('ws-1', ['rm', '-f', '--', 'joke.txt']);
    expect(run).toHaveBeenCalledWith('ws-1', ['rm', '-f', '--', 'notes/extra.md']);
    expect(run).toHaveBeenCalledWith('ws-1', ['commit', '-m', 'restore: target123']);
  });

  it('parses filesystem checkpoints from git log output', async () => {
    const run = vi.fn(async (_workspaceId: string, args: string[]) => {
      const command = args.join(' ');

      if (command === 'rev-parse HEAD') {
        return ok('abc123\n');
      }
      if (args[0] === 'log') {
        return ok('abc123\t2026-04-16T17:30:00.000Z\tcheckpoint: filesystem change @ 2026-04-16 17:30\n');
      }

      throw new Error(`Unexpected git command: ${command}`);
    });

    const runner = {
      ensureRepoInitialized: vi.fn().mockResolvedValue(undefined),
      run,
    } as unknown as GitRunner;

    const workspaceManager = {
      getPath: vi.fn().mockReturnValue('/tmp/ws-1'),
    } as unknown as WorkspaceManager;

    const manager = new VcsManager(workspaceManager, runner);

    const checkpoints = await manager.listCheckpoints('ws-1');

    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.source).toBe('fs');
  });
});
