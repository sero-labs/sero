/**
 * What Git says about one member branch, relative to the workspace the user
 * asked for (#654).
 *
 * A Room whose members edit in their own worktrees leaves their work on their
 * branches, so a delivery that claims the workspace files is only true when no
 * branch holds anything the workspace lacks. The one answer this must never
 * give by accident is "merged": that is the claim that puts work in the user's
 * files when it is not there. So every failure is `commits: null` — unknown,
 * which the caller reports — and only Git itself saying the ref is gone is
 * treated as nothing to name.
 */

import type { OrchestratorHost } from '../host';

/**
 * `'absent'` is a branch Git confirms no longer exists. `commits: null` is a
 * branch whose state could not be read, which is NOT the same as merged.
 */
export type MemberBranchState = 'absent' | { commits: number | null };

/**
 * One `git` call at the workspace root, or null when it could not run at all.
 * The caller reads the exit code, because for Git "no such ref" and "I could not
 * run" are both non-zero and mean different things here.
 */
async function git(
  host: OrchestratorHost,
  command: string,
): Promise<{ exitCode: number; stdout: string } | null> {
  const result = await host.runCommand(`git ${command}`, 15_000).catch(() => null);
  return result ? { exitCode: result.exitCode, stdout: result.stdout } : null;
}

export async function readMemberBranchState(
  host: OrchestratorHost,
  branch: string,
): Promise<MemberBranchState> {
  // Every branch here comes from `createWorktree`, so a name that cannot be
  // handed to a shell intact is a defect. Guessing is worse than reporting it.
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('-')) return { commits: null };
  const ref = `'refs/heads/${branch}'`;
  const exists = await git(host, `rev-parse --verify --quiet ${ref}`);
  // `--verify --quiet` exits 1 for a ref that is not there, and anything else (a
  // timeout, a repo Git could not open) is a read that did not happen. Only the
  // first one means the branch is gone; the rest stay unknown, because "gone" is
  // how a branch holding unmerged work would get dropped.
  if (exists === null) return { commits: null };
  if (exists.exitCode === 1) return 'absent';
  if (exists.exitCode !== 0) return { commits: null };
  // A Room can start before the workspace has its first commit, and the snapshot
  // placement keeps HEAD unborn rather than bootstrapping one. With no commit to
  // compare against, every commit on the branch is missing from the workspace —
  // asking `git rev-list ... --not HEAD` would fail, and a failed read must never
  // be read as "already merged".
  const head = await git(host, 'rev-parse --verify --quiet HEAD');
  if (head === null) return { commits: null };
  const counted = await git(host, head.exitCode === 0
    ? `rev-list --count ${ref} --not HEAD`
    : `rev-list --count ${ref}`);
  if (counted === null || counted.exitCode !== 0) return { commits: null };
  const commits = Number.parseInt(counted.stdout.trim(), 10);
  return { commits: Number.isFinite(commits) && commits >= 0 ? commits : null };
}
