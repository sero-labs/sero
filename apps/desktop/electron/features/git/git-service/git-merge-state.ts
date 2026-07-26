/**
 * The two repo-wide modes the app has to announce: a merge that stopped
 * part-way, and a HEAD that is not on a branch.
 *
 * Both are repository state rather than file state, so they are read once per
 * refresh and carried on `GitAppState`.
 */

import { promises as fs } from 'node:fs';

import type { GitMergeState } from '@sero-ai/common';
import { git } from './git-command-support';

/** True when HEAD points at a commit rather than a branch. */
export async function isDetachedHead(cwd: string): Promise<boolean> {
  // An unborn branch still has a symbolic HEAD, so this stays false there.
  return !(await git(['symbolic-ref', '--quiet', 'HEAD'], cwd));
}

/**
 * Merge state, or undefined when no merge is in progress.
 *
 * `previous` is the last known merge state for this repository. Git drops a
 * path from its unmerged list as soon as it is staged, so the conflicted set
 * only grows here — that is what lets the working tree separate "resolved"
 * from "merged cleanly". It is discarded wholesale when the merge ends.
 */
export async function readMergeState(
  cwd: string,
  previous?: GitMergeState,
): Promise<GitMergeState | undefined> {
  const mergeHead = await git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], cwd);
  if (!mergeHead) return undefined;

  const unmerged = (await git(['diff', '--name-only', '--diff-filter=U'], cwd))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    fromRef: await nameMergeHead(cwd, mergeHead),
    message: await readMergeMessage(cwd),
    conflictPaths: [...new Set([...(previous?.conflictPaths ?? []), ...unmerged])].sort(),
  };
}

/**
 * Git wrote the merge message when the merge began; concluding the merge should
 * commit with it rather than making someone retype what git already said.
 */
async function readMergeMessage(cwd: string): Promise<string> {
  const messagePath = await git(['rev-parse', '--git-path', 'MERGE_MSG'], cwd);
  if (!messagePath) return '';
  const absolute = messagePath.startsWith('/') ? messagePath : `${cwd}/${messagePath}`;
  return (await fs.readFile(absolute, 'utf8').catch(() => ''))
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}

/** The branch being merged in, falling back to a short sha when git can't name one. */
async function nameMergeHead(cwd: string, mergeHead: string): Promise<string> {
  const named = await git(
    ['name-rev', '--name-only', '--refs=refs/heads/*', mergeHead],
    cwd,
  );
  return named && named !== 'undefined' ? named : mergeHead.slice(0, 7);
}
