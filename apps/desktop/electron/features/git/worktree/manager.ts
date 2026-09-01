/**
 * WorktreeManager — git worktree lifecycle management for isolated work items.
 *
 * Each active work item gets its own git worktree at `.sero/worktrees/card-<id>/`,
 * giving it an isolated working directory and branch while sharing the
 * repo's `.git` object store. This enables true parallel card execution.
 *
 * Worktrees are created when a card enters the planning phase and kept
 * around through review so the branch can be revised or merged. They are
 * removed later during explicit cleanup (or cancellation).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { withLock } from '@sero-ai/extension-runtime';
import type { AppRuntimeWorktreeRemoveOptions } from '@sero-ai/common';

import { inferConventionalType, slugifyBranchLabel } from '@electron/features/git/support/branch-naming';
import { ensureBootstrapGitignore } from '@electron/features/git/support/bootstrap-gitignore';
import { resolvePreferredBaseRef } from './workspace-sync';
import { warnCleanupFailure } from '@electron/features/git/support/cleanup-warnings';
import { execWorktreeGit } from './exec';

async function canonicalPath(targetPath: string): Promise<string> {
  return fs.realpath(targetPath).catch(() => path.resolve(targetPath));
}

async function worktreeMutationLockPath(workspacePath: string): Promise<string> {
  const { stdout } = await execWorktreeGit(['rev-parse', '--git-common-dir'], {
    cwd: workspacePath,
    timeout: 5_000,
  });
  const commonDir = await canonicalPath(path.resolve(workspacePath, stdout.trim()));
  return path.join(commonDir, 'sero-worktree-mutation.lock');
}

async function withWorktreeMutationLock<T>(
  workspacePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withLock(await worktreeMutationLockPath(workspacePath), operation, { timeoutMs: 30_000 });
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
async function ensureGitReady(workspacePath: string): Promise<boolean> {
  let bootstrapped = false;

  // Check if it's a git repo
  try {
    await execWorktreeGit(['rev-parse', '--git-dir'], {
      cwd: workspacePath,
      timeout: 5_000,
    });
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

  // Check if there are any commits
  try {
    await execWorktreeGit(['rev-parse', 'HEAD'], {
      cwd: workspacePath,
      timeout: 5_000,
    });
  } catch {
    console.log('[worktree] Creating initial commit (greenfield project)');
    // Ensure default branch is 'main' (not 'master')
    try {
      await execWorktreeGit(['branch', '-M', 'main'], { cwd: workspacePath, timeout: 5_000 });
    } catch { /* branch may not exist yet — that's fine, init -b main handles it */ }
    await execWorktreeGit(['add', '--', '.gitignore'], { cwd: workspacePath, timeout: 10_000 });
    await execWorktreeGit([
      '-c', 'user.name=Sero',
      '-c', 'user.email=sero@local',
      'commit', '--allow-empty', '-m', 'Initial commit',
    ], { cwd: workspacePath, timeout: 10_000 });
    bootstrapped = true;
  }

  return bootstrapped;
}

export interface WorktreeInfo {
  cardId: string;
  branchName: string;
  worktreePath: string;
}

export class WorktreeManager {
  /** Directory within the workspace where worktrees are stored. */
  private static readonly WORKTREES_DIR = path.join('.sero', 'worktrees');

  /**
   * Generate the worktree directory path for a card.
   */
  getPath(workspacePath: string, cardId: string): string {
    return path.join(workspacePath, WorktreeManager.WORKTREES_DIR, `card-${cardId}`);
  }

  /**
   * Generate a branch name for a card based on its title.
   */
  buildBranchName(cardTitle: string, cardId: string): string {
    const type = inferConventionalType(cardTitle);
    const slug = slugifyBranchLabel(cardTitle);
    return `${type}/${slug}-${cardId}`;
  }

  /**
   * Create a worktree for a card.
   *
   * Creates a new branch and checks it out in an isolated directory.
   * The worktree shares the `.git` object store with the main repo.
   * With `existingBranch`, checks out that branch (fetching it from origin
   * when it only exists remotely) instead of minting a new one — never
   * delete such a worktree's branch on removal, it belongs to a PR.
   *
   * @returns The absolute path to the worktree directory
   */
  async create(
    workspacePath: string,
    cardId: string,
    cardTitle: string,
    options?: { existingBranch?: string },
  ): Promise<{ worktreePath: string; branchName: string; greenfield: boolean }> {
    if (options?.existingBranch) {
      return this.createAtExistingBranch(workspacePath, cardId, options.existingBranch);
    }
    // Ensure the workspace is a valid git repo with at least one commit
    const greenfield = await ensureGitReady(workspacePath);

    const worktreePath = this.getPath(workspacePath, cardId);
    const branchName = this.buildBranchName(cardTitle, cardId);
    const baseRef = await resolvePreferredBaseRef(workspacePath);

    await withWorktreeMutationLock(workspacePath, async () => {
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      const addArgs = [
        'worktree', 'add',
        worktreePath,
        '-b', branchName,
        ...(baseRef ? [baseRef] : []),
      ];
      try {
        await execWorktreeGit(addArgs, { cwd: workspacePath, timeout: 30_000 });
      } catch (err: unknown) {
        const stderr = err && typeof err === 'object' && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr) : '';
        const message = err instanceof Error ? err.message : String(err);
        if (stderr.includes('already exists')) {
          await execWorktreeGit(['worktree', 'add', worktreePath, branchName], {
            cwd: workspacePath,
            timeout: 30_000,
          });
        } else {
          throw new Error(
            `Failed to create worktree for card ${cardId}: ${stderr || message || 'Unknown error'}`,
          );
        }
      }
    });

    console.log(`[worktree] Created worktree for card-${cardId} at ${worktreePath} (branch: ${branchName})${greenfield ? ' [greenfield]' : ''}`);
    return { worktreePath, branchName, greenfield };
  }

  /**
   * Check an EXISTING branch out into a worktree (PR-lifecycle work: commits
   * must land on the PR's own branch). The branch is fetched from origin
   * first so a PR pushed from elsewhere is present and current; a local-only
   * branch (no remote) is used as-is.
   */
  private async createAtExistingBranch(
    workspacePath: string,
    cardId: string,
    branchName: string,
  ): Promise<{ worktreePath: string; branchName: string; greenfield: boolean }> {
    // Branch names come from event payloads — refuse anything git itself
    // would refuse rather than passing surprising tokens to the CLI.
    if (branchName.startsWith('-') || !/^[^\s~^:?*[\\]+$/.test(branchName) || branchName.includes('..')) {
      throw new Error(`Invalid branch name "${branchName}"`);
    }
    const worktreePath = this.getPath(workspacePath, cardId);
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });

    // Best-effort: a local-only branch or an offline repo still resolves below.
    try {
      await execWorktreeGit(['fetch', 'origin', branchName], { cwd: workspacePath, timeout: 60_000 });
    } catch {
      console.log(`[worktree] fetch origin ${branchName} failed — trying local refs`);
    }

    const hasRef = async (ref: string): Promise<boolean> => {
      try {
        await execWorktreeGit(['rev-parse', '--verify', '--quiet', ref], { cwd: workspacePath, timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    };

    const addArgs = (await hasRef(`refs/heads/${branchName}`))
      ? ['worktree', 'add', worktreePath, branchName]
      : (await hasRef(`refs/remotes/origin/${branchName}`))
        ? ['worktree', 'add', '--track', '-b', branchName, worktreePath, `origin/${branchName}`]
        : null;
    if (!addArgs) {
      throw new Error(`Branch "${branchName}" exists neither locally nor on origin`);
    }
    await withWorktreeMutationLock(workspacePath, async () => {
      try {
        await execWorktreeGit(addArgs, { cwd: workspacePath, timeout: 30_000 });
      } catch (err: unknown) {
        const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to check out branch "${branchName}" for card ${cardId}: ${stderr || message}`);
      }
    });

    console.log(`[worktree] Created worktree for card-${cardId} at ${worktreePath} (existing branch: ${branchName})`);
    return { worktreePath, branchName, greenfield: false };
  }

  /**
   * Remove a worktree and optionally delete its branch.
   */
  async remove(
    workspacePath: string,
    cardId: string,
    opts?: AppRuntimeWorktreeRemoveOptions,
  ): Promise<void> {
    await withWorktreeMutationLock(workspacePath, async () => {
      const worktreePath = this.getPath(workspacePath, cardId);
      let branchName: string | null = null;
      if (opts?.deleteBranch || opts?.deleteMergedBranch) {
        try {
          const { stdout } = await execWorktreeGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: worktreePath,
            timeout: 5_000,
          });
          branchName = stdout.trim();
        } catch {
          // Worktree may already be gone.
        }
      }

      const args = ['worktree', 'remove', worktreePath];
      if (opts?.force) args.push('--force');
      try {
        await execWorktreeGit(args, { cwd: workspacePath, timeout: 15_000 });
      } catch (error: unknown) {
        const stderr = error && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr: unknown }).stderr) : '';
        const message = error instanceof Error ? error.message : String(error);
        const detail = stderr || message;
        if (detail.includes('is not a working tree') || detail.includes('No such file or directory')) {
          try {
            await execWorktreeGit(['worktree', 'prune'], { cwd: workspacePath, timeout: 10_000 });
          } catch (pruneError) {
            warnCleanupFailure(`failed to prune missing worktree for card-${cardId}`, pruneError);
          }
          return;
        }
        throw new Error(`Could not remove card-${cardId}, so its checkout and branch were kept: ${detail}`);
      }

      try {
        await execWorktreeGit(['worktree', 'prune'], { cwd: workspacePath, timeout: 10_000 });
      } catch (error) {
        warnCleanupFailure(`failed to prune worktrees in ${workspacePath}`, error);
      }

      if (branchName && (opts?.deleteBranch || opts?.deleteMergedBranch)) {
        try {
          await execWorktreeGit(['branch', opts.deleteBranch ? '-D' : '-d', branchName], {
            cwd: workspacePath,
            timeout: 10_000,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          if (!opts.deleteMergedBranch || !detail.includes('not fully merged')) {
            warnCleanupFailure(`failed to delete branch ${branchName} for card-${cardId}`, error);
          }
        }
      }

      console.log(`[worktree] Removed worktree for card-${cardId}`);
    });
  }

  /**
   * List all active kanban worktrees in a workspace.
   */
  async list(workspacePath: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execWorktreeGit([
        'worktree', 'list', '--porcelain',
      ], { cwd: workspacePath, timeout: 10_000 });

      const results: WorktreeInfo[] = [];
      const entries = stdout.split('\n\n').filter(Boolean);

      for (const entry of entries) {
        const lines = entry.split('\n');
        const wtPath = lines.find((l) => l.startsWith('worktree '))?.replace('worktree ', '');
        const branch = lines.find((l) => l.startsWith('branch '))?.replace('branch refs/heads/', '');

        if (!wtPath || !branch) continue;

        // Only include our kanban worktrees
        const dirName = path.basename(wtPath);
        if (!dirName.startsWith('card-')) continue;

        const cardId = dirName.replace('card-', '');
        results.push({
          cardId,
          branchName: branch,
          worktreePath: wtPath,
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Check if a worktree exists for a card.
   */
  async exists(workspacePath: string, cardId: string): Promise<boolean> {
    const worktreePath = this.getPath(workspacePath, cardId);
    const [expectedPath, worktrees, stats] = await Promise.all([
      canonicalPath(worktreePath),
      this.list(workspacePath),
      fs.stat(worktreePath).catch(() => null),
    ]);
    if (!stats?.isDirectory()) return false;
    for (const worktree of worktrees) {
      if (await canonicalPath(worktree.worktreePath) === expectedPath) return true;
    }
    return false;
  }
}
