import { describe, expect, it } from 'vitest';
import type { CommitNode, GitAppState } from '@sero-ai/common';
import { createDefaultGitState } from '@sero-ai/common';
import {
  adaptBranches,
  adaptWorkingCopyStatus,
  deriveHeadLog,
} from './git-state';

function commit(hash: string, parents: string[], refs: CommitNode['refs'] = []): CommitNode {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    authorName: 'Dev',
    authorEmail: 'dev@example.com',
    authorDate: '2026-01-01T00:00:00Z',
    subject: `commit ${hash}`,
    refs,
  };
}

function state(partial: Partial<GitAppState>): GitAppState {
  return { ...createDefaultGitState(), ...partial };
}

describe('deriveHeadLog', () => {
  it('keeps only HEAD-reachable commits in cache order', () => {
    // main: c3 -> c2 -> c1; feature: f1 -> c1 (not reachable from HEAD=c3)
    const commits = [
      commit('c3000000', ['c2000000'], [{ name: 'main', type: 'head' }]),
      commit('f1000000', ['c1000000'], [{ name: 'feature', type: 'local' }]),
      commit('c2000000', ['c1000000']),
      commit('c1000000', []),
    ];
    const log = deriveHeadLog(state({ commits, headHash: 'c300000' }), 40);

    expect(log.map((entry) => entry.sha)).toEqual(['c300000', 'c200000', 'c100000']);
    expect(log[0].isWorkingCopy).toBe(true);
    expect(log[0].branches).toContain('main');
  });

  it('respects the limit', () => {
    const commits = [
      commit('a0000000', ['b0000000'], [{ name: 'main', type: 'head' }]),
      commit('b0000000', ['c0000000']),
      commit('c0000000', []),
    ];
    const log = deriveHeadLog(state({ commits, headHash: 'a000000' }), 2);
    expect(log).toHaveLength(2);
  });
});

describe('adaptWorkingCopyStatus', () => {
  it('dedupes staged/unstaged pairs preferring the staged side and counts conflicts', () => {
    const status = adaptWorkingCopyStatus(state({
      fileChanges: [
        { path: 'a.ts', status: 'modified', staged: true },
        { path: 'a.ts', status: 'modified', staged: false },
        { path: 'b.ts', status: 'conflict', staged: false },
        { path: 'new.ts', status: 'untracked', staged: false },
      ],
    }));

    expect(status.files).toHaveLength(3);
    expect(status.files.find((f) => f.path === 'new.ts')?.status).toBe('added');
    expect(status.conflictCount).toBe(1);
  });
});

describe('adaptBranches', () => {
  it('maps tracking state onto remoteStatuses', () => {
    const branches = adaptBranches(state({
      branches: [
        { name: 'main', current: true, remote: 'origin/main', ahead: 0, behind: 0, lastCommitHash: 'abc' },
        { name: 'feat', current: false, remote: 'origin/feat', ahead: 2, behind: 0, lastCommitHash: 'def' },
        { name: 'local-only', current: false, ahead: 0, behind: 0, lastCommitHash: 'eee' },
      ],
    }));

    expect(branches[0].remoteStatuses).toEqual([{ remote: 'origin', synced: true }]);
    expect(branches[1].remoteStatuses).toEqual([{ remote: 'origin', synced: false }]);
    expect(branches[2].remoteStatuses).toEqual([]);
  });
});
