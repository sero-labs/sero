import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitRunner } from '@electron/features/vcs/core/git-runner';
import type { GitResult } from '@electron/features/vcs/support/types';
import { VcsManager } from '@electron/features/vcs/core/vcs-manager';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

function ok(stdout = '', stderr = ''): GitResult {
  return { exitCode: 0, stdout, stderr };
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createWorkspaceManager(workspacePath: string): WorkspaceManager {
  return {
    getPath: vi.fn().mockReturnValue(workspacePath),
    isContainerEnabled: vi.fn().mockResolvedValue(false),
  } as unknown as WorkspaceManager;
}

function createRealManager(workspacePath: string): VcsManager {
  const workspaceManager = createWorkspaceManager(workspacePath);
  const runner = new GitRunner(
    workspaceManager,
    {
      getRuntime: vi.fn(async () => ({
        backend: 'host',
        hostWorkspacePath: workspacePath,
        runtimeWorkspacePath: '/workspace',
        execFile: async (input: { program: string; args: string[]; env?: Record<string, string> }) => {
          try {
            const stdout = execFileSync(input.program, input.args, {
              cwd: workspacePath,
              encoding: 'utf8',
              env: { ...process.env, ...input.env },
            });
            return ok(stdout);
          } catch (error: unknown) {
            const failure = error as { status?: number; stdout?: string; stderr?: string; message?: string };
            return {
              exitCode: typeof failure.status === 'number' ? failure.status : 1,
              stdout: failure.stdout ?? '',
              stderr: failure.stderr ?? failure.message ?? 'git failed',
            };
          }
        },
      })),
    } as never,
  );

  return new VcsManager(workspaceManager, runner);
}

function createTempRepo(): string {
  const repoDir = mkdtempSync(path.join(tmpdir(), 'sero-vcs-manager-'));
  tempDirs.push(repoDir);
  return repoDir;
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Sero Test',
      GIT_AUTHOR_EMAIL: 'sero-test@example.com',
      GIT_COMMITTER_NAME: 'Sero Test',
      GIT_COMMITTER_EMAIL: 'sero-test@example.com',
    },
  });
}

function initRepo(cwd: string): string {
  runGit(cwd, ['init', '-b', 'main']);
  runGit(cwd, ['config', 'user.name', 'Sero Test']);
  runGit(cwd, ['config', 'user.email', 'sero-test@example.com']);
  writeFileSync(path.join(cwd, 'story.txt'), 'base story\n');
  runGit(cwd, ['add', 'story.txt']);
  runGit(cwd, ['commit', '-m', 'initial']);
  return runGit(cwd, ['rev-parse', 'HEAD']).trim();
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

  it('stores auto turn snapshots in hidden refs and restores mixed working-copy edits without new visible commits', async () => {
    const repoDir = createTempRepo();
    const manager = createRealManager(repoDir);
    const initialHead = initRepo(repoDir);

    writeFileSync(path.join(repoDir, 'story.txt'), 'manual draft\n');
    writeFileSync(path.join(repoDir, 'notes.md'), 'remember this\n');

    const snapshotId = await manager.createInternalSnapshot('ws-1');

    expect(snapshotId.startsWith('turn-undo:')).toBe(true);
    expect(runGit(repoDir, ['log', '--format=%s']).trim()).toBe('initial');
    expect(runGit(repoDir, ['for-each-ref', '--format=%(refname)', 'refs/sero/turn-undo']).trim()).not.toBe('');

    writeFileSync(path.join(repoDir, 'story.txt'), 'agent rewrite\n');
    writeFileSync(path.join(repoDir, 'joke.txt'), 'ha\n');

    const diff = await manager.diff('ws-1', snapshotId);
    expect(diff).toContain('diff --git a/joke.txt b/joke.txt');
    expect(diff).toContain('agent rewrite');

    await manager.restoreCheckpoint('ws-1', snapshotId);

    expect(readFileSync(path.join(repoDir, 'story.txt'), 'utf8')).toBe('manual draft\n');
    expect(readFileSync(path.join(repoDir, 'notes.md'), 'utf8')).toBe('remember this\n');
    expect(existsSync(path.join(repoDir, 'joke.txt'))).toBe(false);
    expect(runGit(repoDir, ['rev-parse', 'HEAD']).trim()).toBe(initialHead);

    const status = runGit(repoDir, ['status', '--short']);
    expect(status).toContain(' M story.txt');
    expect(status).toContain('?? notes.md');
  });

  it('preserves staged changes when restoring an internal snapshot', async () => {
    const repoDir = createTempRepo();
    const manager = createRealManager(repoDir);
    initRepo(repoDir);

    writeFileSync(path.join(repoDir, 'story.txt'), 'manual staged draft\n');
    runGit(repoDir, ['add', 'story.txt']);
    writeFileSync(path.join(repoDir, 'notes.md'), 'remember this\n');

    const snapshotId = await manager.createInternalSnapshot('ws-1');

    expect(
      runGit(repoDir, ['for-each-ref', '--format=%(refname)', 'refs/sero/turn-undo-index']).trim(),
    ).not.toBe('');

    writeFileSync(path.join(repoDir, 'story.txt'), 'agent rewrite\n');
    writeFileSync(path.join(repoDir, 'joke.txt'), 'ha\n');

    await manager.restoreCheckpoint('ws-1', snapshotId);

    expect(readFileSync(path.join(repoDir, 'story.txt'), 'utf8')).toBe('manual staged draft\n');
    expect(readFileSync(path.join(repoDir, 'notes.md'), 'utf8')).toBe('remember this\n');
    expect(existsSync(path.join(repoDir, 'joke.txt'))).toBe(false);

    const status = runGit(repoDir, ['status', '--short']);
    expect(status).toContain('M  story.txt');
    expect(status).toContain('?? notes.md');
  });

  it('cleans up stale internal snapshots by age and retention count', async () => {
    const now = Date.now();
    const staleRef = `refs/sero/turn-undo/${now - 8 * 24 * 60 * 60 * 1_000}-aaaa-bbbb`;
    const staleIndexRef = staleRef.replace('refs/sero/turn-undo/', 'refs/sero/turn-undo-index/');
    const freshRefs = Array.from({ length: 41 }, (_unused, index) => {
      const timestamp = now - index;
      return `refs/sero/turn-undo/${timestamp}-aaaa-${index.toString(16).padStart(4, '0')}`;
    });
    const oldestFreshRef = freshRefs[freshRefs.length - 1] ?? '';
    const oldestFreshIndexRef = oldestFreshRef.replace(
      'refs/sero/turn-undo/',
      'refs/sero/turn-undo-index/',
    );
    const allRefs = [staleRef, ...freshRefs].join('\n');

    const run = vi.fn(async (_workspaceId: string, args: string[]) => {
      const command = args.join(' ');

      if (command === 'for-each-ref --format=%(refname) refs/sero/turn-undo/') {
        return ok(allRefs);
      }
      if (command === `rev-parse --verify ${staleIndexRef}`) {
        return ok(`${staleIndexRef}\n`);
      }
      if (command === `rev-parse --verify ${oldestFreshIndexRef}`) {
        return ok(`${oldestFreshIndexRef}\n`);
      }
      if (args[0] === 'update-ref' && args[1] === '-d') {
        return ok();
      }
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return { exitCode: 1, stdout: '', stderr: 'missing ref' };
      }

      throw new Error(`Unexpected git command: ${command}`);
    });

    const runner = {
      ensureRepoInitialized: vi.fn().mockResolvedValue(undefined),
      run,
    } as unknown as GitRunner;
    const manager = new VcsManager(createWorkspaceManager('/tmp/ws-1'), runner);

    await manager.cleanupInternalSnapshots('ws-1');

    const deleteCalls = run.mock.calls.filter(([, args]) => args[0] === 'update-ref' && args[1] === '-d');
    expect(deleteCalls).toHaveLength(4);
    expect(deleteCalls).toEqual(
      expect.arrayContaining([
        ['ws-1', ['update-ref', '-d', staleRef]],
        ['ws-1', ['update-ref', '-d', staleIndexRef]],
        ['ws-1', ['update-ref', '-d', oldestFreshRef]],
        ['ws-1', ['update-ref', '-d', oldestFreshIndexRef]],
      ]),
    );
  });
});
