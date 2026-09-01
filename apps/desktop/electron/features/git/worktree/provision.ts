/**
 * Physical checkout provisioning, shared by the legacy `WorktreeManager` and
 * the lease pool. Both must bootstrap greenfield repositories, name fresh
 * branches, and check out existing PR branches in exactly the same way, so the
 * behaviour lives here once rather than in each caller.
 */

import { promises as fs } from 'fs';
import path from 'path';

import { inferConventionalType, slugifyBranchLabel } from '@electron/features/git/support/branch-naming';
import { ensureBootstrapGitignore } from '@electron/features/git/support/bootstrap-gitignore';
import { execWorktreeGit } from './exec';

/**
 * Sero's conventional fresh-task branch name. The key is embedded so PR
 * reconciliation keeps matching a branch back to the work that made it.
 */
export function buildTaskBranchName(title: string, key: string): string {
  return `${inferConventionalType(title)}/${slugifyBranchLabel(title)}-${key}`;
}

/**
 * Ensure a workspace directory is a git repo with at least one commit.
 * Required before `git worktree add` can function.
 *
 * - No `.git` → runs `git init`
 * - No commits → creates an initial empty commit
 *
 * @returns true if the repo was bootstrapped (greenfield), false if already existed.
 */
export async function ensureGitReady(workspacePath: string): Promise<boolean> {
  let bootstrapped = false;

  try {
    await execWorktreeGit(['rev-parse', '--git-dir'], { cwd: workspacePath, timeout: 5_000 });
  } catch {
    console.log(`[worktree] Initialising git repo in ${workspacePath}`);
    await execWorktreeGit(['init'], { cwd: workspacePath, timeout: 10_000 });
    bootstrapped = true;
  }

  // Ensure comprehensive .gitignore exists BEFORE the initial commit
  // so node_modules, dist, .DS_Store, etc. are never tracked.
  try {
    await ensureBootstrapGitignore(workspacePath);
  } catch {
    // Best-effort.
  }

  try {
    await execWorktreeGit(['rev-parse', 'HEAD'], { cwd: workspacePath, timeout: 5_000 });
  } catch {
    console.log('[worktree] Creating initial commit (greenfield project)');
    // Ensure default branch is 'main' (not 'master')
    try {
      await execWorktreeGit(['branch', '-M', 'main'], { cwd: workspacePath, timeout: 5_000 });
    } catch { /* branch may not exist yet — that's fine, init -b main handles it */ }
    await execWorktreeGit(['add', '--', '.gitignore'], { cwd: workspacePath, timeout: 10_000 });
    await execWorktreeGit(['commit', '--allow-empty', '-m', 'Initial commit'], {
      cwd: workspacePath,
      timeout: 10_000,
    });
    bootstrapped = true;
  }

  return bootstrapped;
}

/**
 * Branch names reach us from event payloads. Refuse anything git itself would
 * refuse rather than passing surprising tokens to the CLI.
 */
export function isUsableBranchName(branchName: string): boolean {
  return !branchName.startsWith('-')
    && /^[^\s~^:?*[\\]+$/.test(branchName)
    && !branchName.includes('..');
}

export function stderrOf(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    return String((error as { stderr: unknown }).stderr);
  }
  return error instanceof Error ? error.message : String(error);
}

/** `git rev-parse --verify --quiet <ref>` as a boolean. */
export async function refExistsIn(cwd: string, ref: string): Promise<boolean> {
  try {
    await execWorktreeGit(['rev-parse', '--verify', '--quiet', ref], { cwd, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** `git rev-parse --verify <ref>`, or null when the ref does not resolve. */
export async function resolveCommit(cwd: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execWorktreeGit(['rev-parse', '--verify', ref], { cwd, timeout: 5_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Fetches one branch from origin. Best-effort: a local-only branch or an
 * offline repository still resolves from local refs. Kept separate so the pool
 * can fetch OUTSIDE the Git-mutation gate, where it may overlap other work.
 */
export async function fetchBranchBestEffort(workspacePath: string, branchName: string): Promise<void> {
  try {
    await execWorktreeGit(['fetch', 'origin', branchName], { cwd: workspacePath, timeout: 60_000 });
  } catch {
    console.log(`[worktree] fetch origin ${branchName} failed — trying local refs`);
  }
}

/** Adds a worktree on a NEW branch cut from `baseRef` (or HEAD when null). */
export async function addWorktreeOnNewBranch(
  workspacePath: string,
  worktreePath: string,
  branchName: string,
  baseRef: string | null,
): Promise<void> {
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  const addArgs = ['worktree', 'add', worktreePath, '-b', branchName, ...(baseRef ? [baseRef] : [])];
  try {
    await execWorktreeGit(addArgs, { cwd: workspacePath, timeout: 30_000 });
  } catch (error: unknown) {
    const detail = stderrOf(error);
    // A branch of that name already exists: attach to it rather than minting.
    if (detail.includes('already exists')) {
      await execWorktreeGit(['worktree', 'add', worktreePath, branchName], {
        cwd: workspacePath,
        timeout: 30_000,
      });
      return;
    }
    throw new Error(`Failed to create worktree at ${worktreePath}: ${detail || 'Unknown error'}`);
  }
}

/**
 * Checks an EXISTING branch out into a worktree (PR-lifecycle work: commits
 * must land on the PR's own branch). The branch is fetched from origin first so
 * a PR pushed from elsewhere is present and current; a local-only branch is
 * used as-is.
 */
export async function addWorktreeOnExistingBranch(
  workspacePath: string,
  worktreePath: string,
  branchName: string,
  options?: { fetch?: boolean },
): Promise<void> {
  if (!isUsableBranchName(branchName)) throw new Error(`Invalid branch name "${branchName}"`);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  if (options?.fetch !== false) await fetchBranchBestEffort(workspacePath, branchName);

  const addArgs = (await refExistsIn(workspacePath, `refs/heads/${branchName}`))
    ? ['worktree', 'add', worktreePath, branchName]
    : (await refExistsIn(workspacePath, `refs/remotes/origin/${branchName}`))
      ? ['worktree', 'add', '--track', '-b', branchName, worktreePath, `origin/${branchName}`]
      : null;
  if (!addArgs) throw new Error(`Branch "${branchName}" exists neither locally nor on origin`);

  try {
    await execWorktreeGit(addArgs, { cwd: workspacePath, timeout: 30_000 });
  } catch (error: unknown) {
    throw new Error(`Failed to check out branch "${branchName}" at ${worktreePath}: ${stderrOf(error)}`);
  }
}
