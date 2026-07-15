import { describe, expect, it, vi } from 'vitest';
import { checkoutRemote } from '@electron/features/vcs/core/vcs-ops/remote-ops';
import type { GitRunner } from '@electron/features/vcs/core/git-runner';

function createRunner(results: Array<{ exitCode: number; stdout?: string; stderr?: string }>): GitRunner {
  return {
    ensureRepoInitialized: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockImplementation(async () => {
      const result = results.shift();
      return { exitCode: result?.exitCode ?? 0, stdout: result?.stdout ?? '', stderr: result?.stderr ?? '' };
    }),
  } as unknown as GitRunner;
}

describe('remote ops', () => {
  it('treats reachable empty remotes as successful connects', async () => {
    const runner = createRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 1 },
      { exitCode: 0, stdout: '' },
    ]);

    await expect(checkoutRemote(runner, 'workspace-1', 'origin')).resolves.toEqual({
      success: true,
      message: 'Connected origin; no remote branches to import',
    });
    expect(runner.run).toHaveBeenCalledWith('workspace-1', ['fetch', 'origin'], 120_000);
  });

  it('refuses to reset a workspace that already has Git history', async () => {
    const runner = createRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'origin/main\n' },
      { exitCode: 0, stdout: 'local-commit\n' },
    ]);

    await expect(checkoutRemote(runner, 'workspace-1', 'origin')).resolves.toEqual({
      success: false,
      message: 'The workspace already has Git commits. Link the repository without importing to preserve its history.',
    });
    expect(runner.run).not.toHaveBeenCalledWith(
      'workspace-1',
      ['checkout', '-B', 'main', 'origin/main'],
      120_000,
    );
  });

  it('checks out a remote when existing untracked files do not overlap it', async () => {
    const runner = createRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'origin/main\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: '' },
      { exitCode: 0, stdout: 'README.md\0src/index.ts\0' },
      { exitCode: 0, stdout: '.sero-workspace.json\0notes.txt\0' },
      { exitCode: 0, stdout: '' },
      { exitCode: 0 },
      { exitCode: 0 },
    ]);

    await expect(checkoutRemote(runner, 'workspace-1', 'origin')).resolves.toEqual({
      success: true,
      message: 'Checked out origin/main',
    });
    expect(runner.run).toHaveBeenCalledWith(
      'workspace-1',
      ['checkout', '-B', 'main', 'origin/main'],
      120_000,
    );
  });

  it('refuses to overwrite ignored files during checkout', async () => {
    const runner = createRunner([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'origin/main\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: '' },
      { exitCode: 0, stdout: 'config/local.env\0' },
      { exitCode: 0, stdout: '.sero-workspace.json\0' },
      { exitCode: 0, stdout: 'config/local.env\0' },
    ]);

    await expect(checkoutRemote(runner, 'workspace-1', 'origin')).resolves.toEqual({
      success: false,
      message: 'Import would overwrite an existing workspace path: config/local.env',
    });
  });
});
