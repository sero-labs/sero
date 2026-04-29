import { describe, expect, it } from 'vitest';

import type { BranchInfo, RemoteInfo } from '../../shared/types';
import {
  formatBranchLabel,
  groupRemoteBranches,
  sortBranchesForDisplay,
} from './branch-groups';

describe('branch group helpers', () => {
  it('sorts branches by most recent commit date without prioritizing the current branch', () => {
    const branches: BranchInfo[] = [
      {
        name: 'older',
        current: false,
        ahead: 0,
        behind: 0,
        lastCommitDate: '2026-04-01T10:00:00.000Z',
      },
      {
        name: 'current',
        current: true,
        ahead: 0,
        behind: 0,
        lastCommitDate: '2026-04-02T10:00:00.000Z',
      },
      {
        name: 'newer',
        current: false,
        ahead: 0,
        behind: 0,
        lastCommitDate: '2026-04-03T10:00:00.000Z',
      },
    ];

    expect(sortBranchesForDisplay(branches).map((branch) => branch.name)).toEqual([
      'newer',
      'current',
      'older',
    ]);
  });

  it('groups remote branches by remote name and preserves host labels', () => {
    const remoteBranches: BranchInfo[] = [
      { name: 'origin/main', current: false, ahead: 0, behind: 0, lastCommitDate: '2026-04-03T10:00:00.000Z' },
      { name: 'origin/feature', current: false, ahead: 0, behind: 0, lastCommitDate: '2026-04-04T10:00:00.000Z' },
      { name: 'upstream/release', current: false, ahead: 0, behind: 0, lastCommitDate: '2026-04-02T10:00:00.000Z' },
    ];
    const remotes: RemoteInfo[] = [
      { name: 'origin', fetchUrl: 'git@github.com:sero-ai/sero.git', pushUrl: 'git@github.com:sero-ai/sero.git' },
      { name: 'upstream', fetchUrl: 'https://github.com/sero-ai/upstream.git', pushUrl: 'https://github.com/sero-ai/upstream.git' },
    ];

    const groups = groupRemoteBranches(remoteBranches, remotes);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: 'origin', host: 'github.com' });
    expect(groups[0]?.branches.map((branch) => branch.name)).toEqual(['origin/feature', 'origin/main']);
    expect(groups[1]).toMatchObject({ name: 'upstream', host: 'github.com' });
  });

  it('formats remote branch labels without the remote prefix', () => {
    expect(formatBranchLabel('origin/feature/test')).toBe('feature/test');
    expect(formatBranchLabel('main')).toBe('main');
  });
});
