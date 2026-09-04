/**
 * Git operations for the gateway.
 *
 * These run on the same git service the desktop git app uses, so a phone
 * and the desktop always report the same working tree.
 *
 * A diff is capped before it leaves the host. The gateway frame limit is
 * 36 MB and a phone cannot read a diff that size anyway, so an oversized
 * diff is cut and marked.
 */

import { runGitAsync } from '@electron/features/git/git-service/git-exec';
import { getFileChanges } from '@electron/features/git/git-service/git-status-queries';
import { getFileDiff } from '@electron/features/git/git-service/git-diff-queries';
import { getBranches } from '@electron/features/git/git-service/git-refs';
import { isDetachedHead, readMergeState } from '@electron/features/git/git-service/git-merge-state';
import type {
  GatewayGitCommitResult,
  GatewayGitDiff,
  GatewayGitStatus,
} from '@electron/features/gateway/server/types';

/** Diff lines sent for one file. Beyond this the diff is cut. */
export const MAX_DIFF_LINES = 2000;

/** Files staged in one commit. */
export const MAX_COMMIT_PATHS = 500;

/** Longest commit message accepted. */
export const MAX_COMMIT_MESSAGE = 4000;

/** Why a commit was refused. */
export type CommitRefusal = 'git_state_busy' | 'git_nothing_selected' | 'git_commit_failed';

export class GitCommitRefused extends Error {
  constructor(readonly reason: CommitRefusal, message: string) {
    super(message);
    this.name = 'GitCommitRefused';
  }
}

function git(args: string[], cwd: string): Promise<string> {
  return runGitAsync(args, cwd, { allowFailure: true });
}

/** True while a rebase, cherry-pick or revert is part-way through. */
async function isSequenceInProgress(cwd: string): Promise<boolean> {
  // `git status` names these states in its long form, and reading it is
  // one command rather than four filesystem probes across backends.
  const raw = await git(['status'], cwd);
  return /rebase in progress|You are currently (rebasing|cherry-picking|reverting)/i.test(raw);
}

/** Branch, tracking counts and every changed file. */
export async function readGitStatus(cwd: string): Promise<GatewayGitStatus> {
  const [branches, files, detached, mergeState] = await Promise.all([
    getBranches(cwd),
    getFileChanges(cwd),
    isDetachedHead(cwd),
    readMergeState(cwd),
  ]);

  const current = branches.find((branch) => branch.current);

  return {
    branch: current?.name ?? '',
    ahead: current?.ahead ?? 0,
    behind: current?.behind ?? 0,
    detached,
    merging: mergeState !== undefined,
    files: files.map((file) => ({
      path: file.path,
      oldPath: file.oldPath,
      status: file.status,
      staged: file.staged,
    })),
  };
}

/** One file's diff, cut at `MAX_DIFF_LINES`. */
export async function readGitDiff(
  cwd: string,
  filePath: string,
  staged: boolean,
): Promise<GatewayGitDiff | null> {
  const diff = await getFileDiff(cwd, filePath, staged);
  if (!diff) return null;

  const hunks: GatewayGitDiff['hunks'] = [];
  let lines = 0;
  let truncated = false;

  for (const hunk of diff.hunks) {
    if (lines >= MAX_DIFF_LINES) {
      truncated = true;
      break;
    }
    const room = MAX_DIFF_LINES - lines;
    const kept = hunk.lines.slice(0, room);
    if (kept.length < hunk.lines.length) truncated = true;
    lines += kept.length;

    hunks.push({
      oldStart: hunk.oldStart,
      newStart: hunk.newStart,
      lines: kept.map((line) => ({
        type: line.type,
        content: line.content,
        oldLineNo: line.oldLineNo,
        newLineNo: line.newLineNo,
      })),
    });
  }

  return {
    path: diff.path,
    oldPath: diff.oldPath,
    status: diff.status,
    staged,
    binary: diff.binary,
    additions: diff.additions,
    deletions: diff.deletions,
    hunks,
    truncated,
  };
}

/**
 * Stage exactly `paths` and commit them.
 *
 * Nothing else is staged, so a commit from a phone can never sweep up a
 * change the person could not see.
 */
export async function commitChanges(
  cwd: string,
  message: string,
  paths: string[],
): Promise<GatewayGitCommitResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new GitCommitRefused('git_nothing_selected', 'A commit needs a message.');
  }
  if (trimmed.length > MAX_COMMIT_MESSAGE) {
    throw new GitCommitRefused('git_nothing_selected', 'The commit message is too long.');
  }
  if (paths.length === 0) {
    throw new GitCommitRefused('git_nothing_selected', 'Select at least one file to commit.');
  }
  if (paths.length > MAX_COMMIT_PATHS) {
    throw new GitCommitRefused('git_nothing_selected', 'Too many files in one commit.');
  }

  // A merge or a rebase decides its own next commit. Committing into one
  // from a phone would finish it by accident.
  const [merging, sequencing] = await Promise.all([
    readMergeState(cwd),
    isSequenceInProgress(cwd),
  ]);
  if (merging || sequencing) {
    throw new GitCommitRefused(
      'git_state_busy',
      'This workspace is mid-merge or mid-rebase. Finish it on the desktop first.',
    );
  }

  try {
    await runGitAsync(['add', '--', ...paths], cwd);
    await runGitAsync(['commit', '-m', trimmed], cwd);
  } catch (err) {
    throw new GitCommitRefused(
      'git_commit_failed',
      err instanceof Error ? err.message : 'The commit failed.',
    );
  }

  const hash = await git(['rev-parse', '--short', 'HEAD'], cwd);
  const branches = await getBranches(cwd);

  return {
    hash,
    branch: branches.find((branch) => branch.current)?.name ?? '',
    fileCount: paths.length,
  };
}
