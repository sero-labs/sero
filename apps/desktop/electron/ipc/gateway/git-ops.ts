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
import path from 'path';
import type { FileChange } from '@sero-ai/common';
import { runGitAsync } from '@electron/features/git/git-service/git-exec';
import { getFileChanges } from '@electron/features/git/git-service/git-status-queries';
import { getFileDiff } from '@electron/features/git/git-service/git-diff-queries';
import { getBranches } from '@electron/features/git/git-service/git-refs';
import { isDetachedHead, readMergeState } from '@electron/features/git/git-service/git-merge-state';
import {
  LITERAL,
  cleanMessage,
  cleanupMode,
  covers,
  hostFiles,
  readIndexEntries,
  reconcileIndex,
  withHostFallback,
  type TempFiles,
} from './git-commit-index';
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
function plannedPaths(plan: CommitPlan): string[] {
  return [...plan.fromIndex, ...plan.removed, ...plan.fromWorkingTree];
}

/** What a commit needs from the caller beyond the repository itself. */
export interface CommitOptions {
  /**
   * Where the temporary index and message file live while the commit is
   * made. They sit in the git dir, which for a container is a path only
   * the runtime can reach. The host handles anything the runtime cannot.
   */
  files?: TempFiles;
}

export type { TempFiles } from './git-commit-index';

/**
 * Whether the repository signs its commits: unset is no, a bare
 * `gpgsign` with no value is yes, and a value git cannot read as a
 * boolean fails here, before anything is made, as `git commit` fails.
 */
async function readSignConfig(cwd: string): Promise<boolean> {
  const value = await runGitAsync(
    ['config', '--type=bool', '--default=false', '--get', 'commit.gpgsign'],
    cwd,
  );
  return value === 'true';
}

/** A hook the commit runs. A missing hook is not an error. */
function runHook(
  temp: (args: string[]) => Promise<string>,
  name: string,
  ...args: string[]
): Promise<string> {
  return temp(['hook', 'run', '--ignore-missing', name, ...(args.length > 0 ? ['--', ...args] : [])]);
}

/**
 * Build the commit in a temporary index, then commit that.
 *
 * The real index is read, never written, until the commit exists. So an
 * unrelated file someone staged on the desktop stays staged and out of
 * this commit, and a partially staged file commits only what was shown.
 *
 * The steps of `git commit` are run one by one rather than as one
 * command: the hooks, the tree, the commit object, then the ref. That
 * way the tree is checked against the selection before anything exists,
 * the commit's hash is known rather than read back from HEAD, and HEAD
 * moves only from the commit it was read at. Nothing is made until
 * every check has passed, so the one thing ever put back is a branch a
 * hook pointed a detached HEAD at, and that from the exact hash.
 * Resolves with the hash of the commit made and the branch it is on.
 */
async function commitFromPlan(
  cwd: string,
  message: string,
  plan: CommitPlan,
  options: CommitOptions,
): Promise<{ hash: string; branch: string }> {
  const gitDir = await runGitAsync(['rev-parse', '--git-dir'], cwd);
  const stem = path.posix.join(
    gitDir.replace(/\\/g, '/'),
    `sero-remote-${randomBytes(6).toString('hex')}`,
  );
  const indexFile = `${stem}.index`;
  const messageFile = `${stem}.msg`;
  const files = options.files ? withHostFallback(options.files, hostFiles(cwd)) : hostFiles(cwd);
  const env = { GIT_INDEX_FILE: indexFile };
  const temp = (args: string[]) => runGitAsync(args, cwd, { env });
  // What HEAD is now: the branch it names, or nothing when detached, and
  // the commit it is at. The commit goes onto that branch, so a switch
  // made on the desktop in the meantime cannot redirect it.
  const [ref, before, sign, cleanup, commentChar] = await Promise.all([
    git(['symbolic-ref', '--quiet', 'HEAD'], cwd),
    git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd),
    readSignConfig(cwd),
    git(['config', '--get', 'commit.cleanup'], cwd),
    git(['config', '--get', 'core.commentchar'], cwd),
  ]);
  const planned = plannedPaths(plan);

  // The real index as it stands now. The staged copies come from here,
  // and after the commit only entries still matching it are rewritten.
  const snapshot = await readIndexEntries(cwd, planned);

  try {
    await temp(['read-tree', before || '--empty']);

    // A staged entry is copied across; a selected path with no entry was
    // deleted in the real index, so it leaves the commit too.
    const staged = new Set<string>();
    for (const [filePath, entry] of snapshot) {
      if (!plan.fromIndex.some((selected) => covers(selected, filePath))) continue;
      staged.add(filePath);
      await temp([LITERAL, 'update-index', '--add', '--cacheinfo', `${entry.mode},${entry.sha},${filePath}`]);
    }
    for (const filePath of [...plan.fromIndex.filter((p) => !staged.has(p)), ...plan.removed]) {
      await temp([LITERAL, 'update-index', '--force-remove', '--', filePath]);
    }
    if (plan.fromWorkingTree.length > 0) {
      await temp([LITERAL, 'add', '--', ...plan.fromWorkingTree]);
    }

    // The hooks see the same index and message `git commit` would show
    // them, and a hook may change either. A hook that fails refuses the
    // commit with its own words.
    await runHook(temp, 'pre-commit');
    await files.write(messageFile, `${message}\n`);
    await runHook(temp, 'prepare-commit-msg', messageFile, 'message');
    await runHook(temp, 'commit-msg', messageFile);
    const finalMessage = cleanMessage(await files.read(messageFile), cleanupMode(cleanup), commentChar);
    if (!finalMessage) throw new Error('A commit hook left the message empty.');

    // What the commit would change, checked before it exists. A
    // pre-commit hook may stage more, as `git add -A` hooks do. Rename
    // and copy detection is off so a copy's untouched source, which the
    // plan leaves alone on purpose, is not reported as a change.
    const tree = await temp(['write-tree']);
    const changed = (await runGitAsync(
      before
        ? ['diff-tree', '--no-renames', '--name-only', '-r', '-z', before, tree]
        : ['ls-tree', '--name-only', '-r', '-z', tree],
      cwd,
      { trim: false },
    )).split('\0').filter(Boolean);
    const unplanned = changed.filter((filePath) => !planned.some((p) => covers(p, filePath)));
    if (unplanned.length > 0) {
      throw new Error(`A commit hook added files that were not selected: ${unplanned.join(', ')}.`);
    }
    if (changed.length === 0) throw new Error('There is nothing to commit.');

    // The branch moves only from `before`, the commit the tree was built
    // on. A commit that landed on the desktop in the meantime would be
    // the parent instead, and this tree, which knows nothing of it,
    // would undo its changes. The swap is atomic, so a refusal leaves
    // nothing but an unreferenced commit object for git to collect.
    // `commit-tree` does not read `commit.gpgsign` as `git commit` does,
    // so a repository that signs is told to sign here.
    const ours = await runGitAsync(
      [
        'commit-tree', tree,
        ...(before ? ['-p', before] : []),
        ...(sign ? ['-S'] : []),
        '-m', finalMessage,
      ],
      cwd,
    );
    const moved = 'The repository changed while the commit was being made. Refresh and try again.';
    try {
      await runGitAsync(
        ['update-ref', '-m', `commit: ${finalMessage.split('\n')[0]}`, ref || 'HEAD', ours, before],
        cwd,
      );
    } catch {
      throw new Error(moved);
    }
    let landedOn = ref;
    if (!ref) {
      // A detached HEAD is updated through HEAD itself. Had a hook
      // meanwhile pointed HEAD at a branch at the same commit, that
      // branch took the commit instead. The hash is exact, so the
      // branch is put back from it, and only from it. If even that
      // swap fails, a commit has already landed on top there, and the
      // commit stays where it is: the reply names that branch.
      const nowRef = await git(['symbolic-ref', '--quiet', 'HEAD'], cwd);
      if (nowRef) {
        const putBack = await runGitAsync(['update-ref', nowRef, before, ours], cwd)
          .then(() => true, () => false);
        if (putBack) throw new Error(moved);
        landedOn = nowRef;
      }
    }

    // `git commit` ignores what post-commit says, and so does this. A
    // hook that reads HEAD expects to find the commit just made there;
    // if HEAD has moved on already, it is not run against the wrong one.
    if (await git(['rev-parse', 'HEAD'], cwd) === ours) {
      await runHook(temp, 'post-commit').catch((err: unknown) => {
        console.warn('[gateway] The post-commit hook failed:', err);
      });
    } else {
      console.warn('[gateway] HEAD moved before the post-commit hook could run; the hook was skipped.');
    }

    // The real index now follows the commit for every selected path, so
    // the tree reads clean rather than as a staged deletion or, after a
    // hook reformatted a staged file, a staged reversal. The commit
    // exists whatever happens here, so a failure is logged, not reported
    // as a failed commit.
    try {
      await reconcileIndex(cwd, ours, planned, snapshot);
    } catch (err) {
      console.error('[gateway] Committed, but the index could not be updated:', err);
    }
    return { hash: ours, branch: landedOn.replace(/^refs\/heads\//, '') };
  } finally {
    // The commit, or the refusal, stands whatever happens to these.
    await Promise.allSettled([files.remove(indexFile), files.remove(messageFile)]);
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
  options: CommitOptions = {},
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

  return serialized(cwd, () => commitSelected(cwd, trimmed, paths, options));
}

async function commitSelected(
  cwd: string,
  message: string,
  paths: string[],
  options: CommitOptions,
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

  let commit: { hash: string; branch: string };
  try {
    commit = await commitFromPlan(cwd, message, plan, options);
  } catch (err) {
    throw new GitCommitRefused(
      'git_commit_failed',
      err instanceof Error ? err.message : 'The commit failed.',
    );
  }

  // The branch is the one the commit went onto, which is what the phone
  // asked for, whatever HEAD names by now.
  return {
    hash: await runGitAsync(['rev-parse', '--short', commit.hash], cwd),
    branch: commit.branch,
    fileCount: new Set(paths).size,
  };
}
