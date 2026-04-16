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
