import path from 'node:path';

import type { BranchInfo } from '../shared/types';
import { runGit } from './git-exec';

function git(args: string[], cwd: string): string {
  return runGit(args, cwd, { allowFailure: true });
}

function nonEmpty(line: string): boolean {
  return line.trim().length > 0;
}

function getWorktreeRoot(cwd: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd) || cwd;
}

function getBranchWorktreeMap(cwd: string): Map<string, string> {
  const raw = git(['worktree', 'list', '--porcelain'], cwd);
  if (!raw) return new Map();

  const worktreeRoot = path.resolve(getWorktreeRoot(cwd));
  const result = new Map<string, string>();
  const blocks = raw.split(/\n(?=worktree )/g).filter(nonEmpty);

  for (const block of blocks) {
    const lines = block.split('\n').filter(nonEmpty);
    const worktreePath = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    const branchRef = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
    if (!worktreePath || !branchRef?.startsWith('refs/heads/')) continue;

    const branchName = branchRef.slice('refs/heads/'.length);
    const resolvedWorktree = path.resolve(worktreePath);
    if (resolvedWorktree === worktreeRoot) continue;
    result.set(branchName, worktreePath);
  }

  return result;
}

function parseTracking(track?: string): { ahead: number; behind: number } {
  return {
    ahead: parseInt(track?.match(/ahead (\d+)/)?.[1] ?? '0', 10),
    behind: parseInt(track?.match(/behind (\d+)/)?.[1] ?? '0', 10),
  };
}

function sortBranches(branches: BranchInfo[]): BranchInfo[] {
  return [...branches].sort((a, b) => {
    const aTime = a.lastCommitDate ? Date.parse(a.lastCommitDate) : 0;
    const bTime = b.lastCommitDate ? Date.parse(b.lastCommitDate) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name);
  });
}

export function getBranches(cwd: string): BranchInfo[] {
  const raw = git([
    'for-each-ref',
    '--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(objectname:short)%00%(creatordate:iso-strict)',
    'refs/heads/',
  ], cwd);
  if (!raw) return [];

  const worktreeByBranch = getBranchWorktreeMap(cwd);
  const branches = raw.split('\n').filter(nonEmpty).map((line) => {
    const [name, head, upstream, track, hash, date] = line.split('\x00');
    const branchName = name ?? '';
    const tracking = parseTracking(track);

    return {
      name: branchName,
      current: head === '*',
      remote: upstream || undefined,
      ahead: tracking.ahead,
      behind: tracking.behind,
      lastCommitHash: hash,
      lastCommitDate: date,
      checkedOutIn: worktreeByBranch.get(branchName),
    } satisfies BranchInfo;
  });

  return sortBranches(branches);
}

export function getRemoteBranches(cwd: string): BranchInfo[] {
  const raw = git([
    'for-each-ref',
    '--format=%(refname:short)%00%(objectname:short)%00%(creatordate:iso-strict)',
    'refs/remotes/',
  ], cwd);
  if (!raw) return [];

  const remoteBranches = raw.split('\n').filter(nonEmpty).map((line) => {
    const [name, hash, date] = line.split('\x00');
    return {
      name: name ?? '',
      current: false,
      ahead: 0,
      behind: 0,
      lastCommitHash: hash,
      lastCommitDate: date,
    } satisfies BranchInfo;
  }).filter((branch) => branch.name !== 'origin/HEAD' && !branch.name.endsWith('/HEAD'));

  return sortBranches(remoteBranches);
}
