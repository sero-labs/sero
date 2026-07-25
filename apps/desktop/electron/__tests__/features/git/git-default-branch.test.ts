import { beforeEach, describe, expect, it, vi } from 'vitest';

const runGitAsync = vi.hoisted(() => vi.fn());

vi.mock('@electron/features/git/git-service/git-exec', () => ({ runGitAsync }));

import { getDefaultBranch } from '@electron/features/git/git-service/git-default-branch';

function respond(table: Record<string, string>): void {
  runGitAsync.mockImplementation((args: string[]) => {
    const key = args.slice(0, 2).join(' ');
    return Promise.resolve(table[key] ?? '');
  });
}

describe('getDefaultBranch', () => {
  beforeEach(() => { runGitAsync.mockReset(); });

  it('takes the branch the remote points its HEAD at', async () => {
    respond({
      remote: 'origin',
      'symbolic-ref refs/remotes/origin/HEAD': 'refs/remotes/origin/trunk',
    });

    expect(await getDefaultBranch('/repo')).toBe('trunk');
  });

  // `git remote show -n` answers with a placeholder rather than failing, and a
  // placeholder rendered as a branch name reads as a bug in the UI.
  it('never returns a placeholder from `remote show`', async () => {
    respond({
      remote: 'origin',
      'remote show': 'HEAD branch: (not queried)',
      'rev-parse --verify': 'abc123',
    });

    expect(await getDefaultBranch('/repo')).toBe('main');
  });

  it('is undefined when there is no remote and no usual branch', async () => {
    respond({ remote: '' });
    expect(await getDefaultBranch('/repo')).toBeUndefined();
  });
});
