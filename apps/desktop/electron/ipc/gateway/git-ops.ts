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

import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { FileChange } from '@sero-ai/common';
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

/**
 * A pathspec is taken as written. Without this, a file called `*.txt`
 * would match every text file.
 */
const LITERAL = '--literal-pathspecs';

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
 * Which copy of each selected file the commit takes.
 *
 * The phone shows the staged diff of a file that has one, so that is the
 * copy committed; the working tree is used only for a file with no staged
 * copy. A rename takes its source away with it, unless that source has a
 * staged change of its own, which was not selected and stays out. A copy
 * leaves its source as HEAD has it.
 */
interface CommitPlan {
  /** Paths whose index entry is copied into the commit. */
  fromIndex: string[];
  /** Paths removed by the commit: the sources of selected renames. */
  removed: string[];
  /** Paths whose working-tree content is committed. */
  fromWorkingTree: string[];
}

function planCommit(paths: string[], changes: FileChange[]): CommitPlan {
  const byPath = new Map<string, { staged?: FileChange; working?: FileChange }>();
  for (const change of changes) {
    const slot = byPath.get(change.path) ?? {};
    if (change.staged) slot.staged = change;
    else slot.working = change;
    byPath.set(change.path, slot);
  }

  const selected = new Set(paths);
  const plan: CommitPlan = { fromIndex: [], removed: [], fromWorkingTree: [] };
  for (const path of selected) {
    const slot = byPath.get(path);
    if (!slot) {
      throw new GitCommitRefused('git_nothing_selected', `${path} has no change to commit.`);
    }
    if (slot.staged?.status === 'conflict' || slot.working?.status === 'conflict') {
      throw new GitCommitRefused(
        'git_state_busy',
        `${path} has a conflict. Resolve it on the desktop first.`,
      );
    }
    if (!slot.staged) {
      plan.fromWorkingTree.push(path);
      continue;
    }
    plan.fromIndex.push(path);
    const source = slot.staged.oldPath;
    if (
      slot.staged.status === 'renamed'
      && source
      && !selected.has(source)
      && !byPath.get(source)?.staged
    ) {
      plan.removed.push(source);
    }
  }
  return plan;
}

/** Every path the commit may touch. A selected directory covers its files. */
function isPlanned(plan: CommitPlan, changed: string): boolean {
  const planned = [...plan.fromIndex, ...plan.removed, ...plan.fromWorkingTree];
  return planned.some((path) =>
    path === changed || (path.endsWith('/') && changed.startsWith(path)));
}

/** Where the temporary index lives, relative to `cwd`. */
function tempIndexPath(gitDir: string): string {
  const name = `sero-remote-${randomBytes(6).toString('hex')}.index`;
  // A relative git dir is `.git` under `cwd`, out of sight of file
  // watchers. An absolute one may be a linked worktree or, for a
  // container, a path the host cannot reach, so the index goes under
  // `cwd` itself: the one directory host and container both see.
  return path.isAbsolute(gitDir) ? name : path.posix.join(gitDir.replace(/\\/g, '/'), name);
}

/**
 * Build the commit in a temporary index, then commit that.
 *
 * The real index is read, never written, until the commit exists. So an
 * unrelated file someone staged on the desktop stays staged and out of
 * this commit, and a partially staged file commits only what was shown.
 */
async function commitFromPlan(cwd: string, message: string, plan: CommitPlan): Promise<void> {
  const gitDir = await runGitAsync(['rev-parse', '--git-dir'], cwd);
  const indexFile = tempIndexPath(gitDir);
  const env = { GIT_INDEX_FILE: indexFile };
  const temp = (args: string[]) => runGitAsync(args, cwd, { env });
  const before = await git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd);

  try {
    await temp(['read-tree', before ? 'HEAD' : '--empty']);

    if (plan.fromIndex.length > 0) {
      // `ls-files --stage` reads the real index. An entry it lists is
      // copied across; a path it does not list was deleted there, so
      // it leaves the commit too.
      const raw = await runGitAsync(
        [LITERAL, 'ls-files', '--stage', '-z', '--', ...plan.fromIndex],
        cwd,
        { trim: false },
      );
      const listed = new Set<string>();
      for (const entry of raw.split('\0')) {
        if (!entry) continue;
        const tab = entry.indexOf('\t');
        const [mode, sha] = entry.slice(0, tab).split(' ');
        const filePath = entry.slice(tab + 1);
        listed.add(filePath);
        await temp([LITERAL, 'update-index', '--add', '--cacheinfo', mode, sha, filePath]);
      }
      for (const filePath of plan.fromIndex) {
        if (!listed.has(filePath)) await temp([LITERAL, 'update-index', '--force-remove', '--', filePath]);
      }
    }
    for (const filePath of plan.removed) {
      await temp([LITERAL, 'update-index', '--force-remove', '--', filePath]);
    }

    if (plan.fromWorkingTree.length > 0) {
      await temp([LITERAL, 'add', '--', ...plan.fromWorkingTree]);
    }

    await temp(['commit', '-m', message]);

    // A pre-commit hook runs against the temporary index and may stage
    // more, as `git add -A` hooks do. The commit already exists by the
    // time that can be seen, so it is undone rather than kept.
    const changed = (await runGitAsync(
      ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'],
      cwd,
      { trim: false },
    )).split('\0').filter(Boolean);
    const unplanned = changed.filter((filePath) => !isPlanned(plan, filePath));
    if (unplanned.length > 0) {
      if (before) await runGitAsync(['update-ref', 'HEAD', before], cwd);
      else await runGitAsync(['update-ref', '-d', 'HEAD'], cwd);
      throw new Error(
        `A commit hook added files that were not selected: ${unplanned.join(', ')}.`,
      );
    }
  } finally {
    await fs.rm(path.join(cwd, indexFile), { force: true }).catch(() => undefined);
  }

  // The real index now follows the commit for the working-tree copies,
  // so the tree reads clean rather than as a staged deletion. The commit
  // exists whatever happens here, so a failure is logged, not reported
  // as a failed commit.
  if (plan.fromWorkingTree.length > 0) {
    try {
      await runGitAsync([LITERAL, 'add', '--', ...plan.fromWorkingTree], cwd);
    } catch (err) {
      console.error('[gateway] Committed, but the index could not be updated:', err);
    }
  }
}

/** One commit at a time per repository. */
const commitQueues = new Map<string, Promise<unknown>>();

function serialized<T>(cwd: string, task: () => Promise<T>): Promise<T> {
  const previous = commitQueues.get(cwd) ?? Promise.resolve();
  const next = previous.then(task, task);
  commitQueues.set(cwd, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * Commit exactly `paths`.
 *
 * Nothing else enters the commit, and nothing else staged is disturbed,
 * so a commit from a phone can never sweep up a change the person could
 * not see. Commits to one repository run one after another.
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

  return serialized(cwd, () => commitSelected(cwd, trimmed, paths));
}

async function commitSelected(
  cwd: string,
  message: string,
  paths: string[],
): Promise<GatewayGitCommitResult> {
  // A merge or a rebase decides its own next commit. Committing into one
  // from a phone would finish it by accident.
  const [merging, sequencing, changes] = await Promise.all([
    readMergeState(cwd),
    isSequenceInProgress(cwd),
    getFileChanges(cwd),
  ]);
  if (merging || sequencing) {
    throw new GitCommitRefused(
      'git_state_busy',
      'This workspace is mid-merge or mid-rebase. Finish it on the desktop first.',
    );
  }

  const plan = planCommit(paths, changes);

  try {
    await commitFromPlan(cwd, message, plan);
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
    fileCount: new Set(paths).size,
  };
}
