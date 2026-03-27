import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubRepoOps } from '../../../../features/auth/github/repo-ops';
import type { GitRunner } from '../../../../features/vcs/core/git-runner';
import type { WorkspaceManager } from '../../../../features/workspace/manager';

function ok(stdout = '', stderr = '') {
  return { exitCode: 0, stdout, stderr };
}

function fail(stderr: string) {
  return { exitCode: 1, stdout: '', stderr };
}

describe('GitHubRepoOps', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('bootstraps and pushes main for a fresh workspace before first PRs exist', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-ops-'));

    let headChecks = 0;
    const run = vi.fn(async (_workspaceId: string, args: string[], _timeoutMs?: number) => {
      const command = args.join(' ');

      if (command === 'rev-parse HEAD') {
        headChecks += 1;
        return headChecks === 1 ? fail('fatal: ambiguous argument HEAD') : ok('abc123\n');
      }
      if (command === 'remote get-url origin') return fail('no origin');
      if (command === 'symbolic-ref HEAD refs/heads/main') return ok();
      if (command === 'add -- .gitignore') return ok();
      if (command === 'commit --allow-empty -m Initial commit') return ok('[main (root-commit) abc123] Initial commit');
      if (command === 'rev-parse --verify main') return ok('abc123\n');
      if (command === 'push -u origin main') return ok();
      if (command === 'remote set-head origin main') return ok();
      throw new Error(`Unexpected git command: ${command}`);
    });

    const runCommand = vi.fn(async (_workspaceId: string, program: string, args: string[]) => {
      if (program !== 'gh') {
        throw new Error(`Unexpected command: ${program}`);
      }

      if (args.slice(0, 2).join(' ') === 'repo create') {
        return ok('https://github.com/monobyte/helloworld3\n');
      }
      if (args.slice(0, 2).join(' ') === 'repo edit') {
        return ok();
      }
      if (args.slice(0, 2).join(' ') === 'repo view') {
        return ok('https://github.com/monobyte/helloworld3\n');
      }

      throw new Error(`Unexpected gh command: ${args.join(' ')}`);
    });

    const runner = {
      ensureRepoInitialized: vi.fn().mockResolvedValue(undefined),
      run,
      runCommand,
    } as unknown as GitRunner;

    const workspaceManager = {
      getPath: vi.fn().mockReturnValue(tmpDir),
    } as unknown as WorkspaceManager;

    const ops = new GitHubRepoOps(runner, workspaceManager);
    const result = await ops.createRepo('helloworld3', {
      name: 'helloworld3',
      visibility: 'private',
      addRemote: true,
    });

    expect(result.success).toBe(true);
    expect(runner.ensureRepoInitialized).toHaveBeenCalledWith('helloworld3');
    expect(run).toHaveBeenCalledWith('helloworld3', ['add', '--', '.gitignore'], 10_000);
    expect(run).toHaveBeenCalledWith('helloworld3', ['push', '-u', 'origin', 'main'], 60_000);
    expect(runCommand).toHaveBeenCalledWith(
      'helloworld3',
      'gh',
      ['repo', 'edit', '--default-branch', 'main'],
      30_000,
    );

    const gitignore = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.sero-workspace.json');
    expect(gitignore).toContain('.sero/');
  });
});
