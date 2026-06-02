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
});
