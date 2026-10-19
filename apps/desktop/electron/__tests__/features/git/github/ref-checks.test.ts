import { describe, expect, it } from 'vitest';
import type { GhInvoker } from '@electron/features/git/github/invoker';
import { getRefChecks } from '@electron/features/git/github/ref-checks';

/** Answers the check-runs and status endpoints the way GitHub does. */
function github(runs: unknown[], statuses: unknown[]): GhInvoker {
  return async (args) => ({
    stdout: JSON.stringify(args[1].includes('/check-runs') ? { check_runs: runs } : { sha: 'abc123', statuses }),
    stderr: '',
  });
}

describe('getRefChecks', () => {
  it('stays pending while any check runs, so a wait does not end early', async () => {
    const checks = await getRefChecks(github([{ name: 'test', status: 'completed', conclusion: 'success' }, { name: 'lint', status: 'in_progress', conclusion: null }], []), 'feat/x');
    expect(checks.state).toBe('pending');
  });

  it('fails when a check run or a commit status failed, and passes only when all passed', async () => {
    const cancelled = await getRefChecks(github([{ name: 'test', status: 'completed', conclusion: 'cancelled' }], []), 'main');
    expect(cancelled.state).toBe('failed');
    const statusError = await getRefChecks(github([{ name: 'test', status: 'completed', conclusion: 'skipped' }], [{ context: 'ci/legacy', state: 'error' }]), 'main');
    expect(statusError.state).toBe('failed');
    const passed = await getRefChecks(github([{ name: 'test', status: 'completed', conclusion: 'success' }], [{ context: 'ci/legacy', state: 'success' }]), 'main');
    expect(passed).toMatchObject({ state: 'passed', sha: 'abc123' });
  });

  it('reports none when GitHub has no check yet, and unknown when gh fails', async () => {
    expect((await getRefChecks(github([], []), 'main')).state).toBe('none');
    const failing: GhInvoker = async () => { throw new Error('gh: To get started with GitHub CLI, please run: gh auth login'); };
    expect(await getRefChecks(failing, 'main')).toMatchObject({ state: 'unknown', reason: expect.stringContaining('gh auth login') });
  });
});
