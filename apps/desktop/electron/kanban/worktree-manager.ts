/**
 * WorktreeManager — git worktree lifecycle management for Kanban cards.
 *
 * Each active card gets its own git worktree at `.sero/worktrees/card-<id>/`,
 * giving it an isolated working directory and branch while sharing the
 * repo's `.git` object store. This enables true parallel card execution.
 *
 * Worktrees are created when a card enters the planning phase and removed
 * when the card reaches done or is cancelled.
 */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

import { inferConventionalType, slugifyBranchLabel } from '../vcs/branch-naming';

const execFileAsync = promisify(execFile);

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

  // Check if it's a git repo
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], {
      cwd: workspacePath,
      timeout: 5_000,
    });
  } catch {
    console.log(`[worktree] Initialising git repo in ${workspacePath}`);
    await execFileAsync('git', ['init'], { cwd: workspacePath, timeout: 10_000 });
    bootstrapped = true;
  }

  // Ensure comprehensive .gitignore exists BEFORE the initial commit
  // so node_modules, dist, .DS_Store, etc. are never tracked
  const gitignorePath = path.join(workspacePath, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf8').catch(() => '');
    const required = [
      'node_modules/', 'dist/', 'build/', '.DS_Store', '*.log',
      '.env', '.env.local', 'coverage/', '.sero/', '__pycache__/',
      '*.pyc', 'target/', '.next/', '.nuxt/', '.turbo/',
    ];
    const missing = required.filter((p) => !content.includes(p));
    if (missing.length > 0) {
      const sep = content && !content.endsWith('\n') ? '\n' : '';
      await fs.writeFile(gitignorePath, content + sep + missing.join('\n') + '\n', 'utf8');
    }
  } catch { /* best-effort */ }

  // Check if there are any commits
  try {
    await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: workspacePath,
      timeout: 5_000,
    });
  } catch {
    console.log('[worktree] Creating initial commit (greenfield project)');
    // Ensure default branch is 'main' (not 'master')
    try {
      await execFileAsync('git', ['branch', '-M', 'main'], { cwd: workspacePath, timeout: 5_000 });
    } catch { /* branch may not exist yet — that's fine, init -b main handles it */ }
    await execFileAsync('git', ['add', '-A'], { cwd: workspacePath, timeout: 10_000 });
    await execFileAsync('git', [
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
   *
   * @returns The absolute path to the worktree directory
   */
  async create(
    workspacePath: string,
    cardId: string,
    cardTitle: string,
  ): Promise<{ worktreePath: string; branchName: string; greenfield: boolean }> {
    // Ensure the workspace is a valid git repo with at least one commit
    const greenfield = await ensureGitReady(workspacePath);

    const worktreePath = this.getPath(workspacePath, cardId);
    const branchName = this.buildBranchName(cardTitle, cardId);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });

    // Create worktree with a new branch from the current HEAD
    try {
      await execFileAsync('git', [
        'worktree', 'add',
        worktreePath,
        '-b', branchName,
      ], {
        cwd: workspacePath,
        timeout: 30_000,
      });
    } catch (err: unknown) {
      const stderr = err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr) : '';
      const message = err instanceof Error ? err.message : String(err);
      // If branch already exists, try without -b
      if (stderr.includes('already exists')) {
        await execFileAsync('git', [
          'worktree', 'add',
          worktreePath,
          branchName,
        ], {
          cwd: workspacePath,
          timeout: 30_000,
        });
      } else {
        throw new Error(
          `Failed to create worktree for card ${cardId}: ${stderr || message || 'Unknown error'}`,
        );
      }
    }

    console.log(`[worktree] Created worktree for card-${cardId} at ${worktreePath} (branch: ${branchName})${greenfield ? ' [greenfield]' : ''}`);
    return { worktreePath, branchName, greenfield };
  }

  /**
   * Remove a worktree and optionally delete its branch.
   */
  async remove(
    workspacePath: string,
    cardId: string,
    opts?: { deleteBranch?: boolean; force?: boolean },
  ): Promise<void> {
    const worktreePath = this.getPath(workspacePath, cardId);

    // Get branch name before removal
    let branchName: string | null = null;
    if (opts?.deleteBranch) {
      try {
        const { stdout } = await execFileAsync('git', [
          'rev-parse', '--abbrev-ref', 'HEAD',
        ], { cwd: worktreePath, timeout: 5_000 });
        branchName = stdout.trim();
      } catch {
        // Worktree may already be gone
      }
    }

    // Remove worktree
    const args = ['worktree', 'remove', worktreePath];
    if (opts?.force) args.push('--force');

    try {
      await execFileAsync('git', args, {
        cwd: workspacePath,
        timeout: 15_000,
      });
    } catch (err: unknown) {
      const stderr = err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr) : '';
      const message = err instanceof Error ? err.message : String(err);
      // If the directory is already gone, prune instead
      if (stderr.includes('is not a working tree')) {
        await execFileAsync('git', ['worktree', 'prune'], {
          cwd: workspacePath,
          timeout: 10_000,
        });
      } else {
        console.warn(`[worktree] Failed to remove card-${cardId}:`, stderr || message);
      }
    }

    // Clean up the directory if it still exists
    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
    } catch {
      // Already gone
    }

    // Delete branch if requested
    if (branchName && opts?.deleteBranch) {
      try {
        await execFileAsync('git', ['branch', '-D', branchName], {
          cwd: workspacePath,
          timeout: 10_000,
        });
      } catch {
        // Branch may not exist or may be checked out elsewhere
      }
    }

    console.log(`[worktree] Removed worktree for card-${cardId}`);
  }

  /**
   * List all active kanban worktrees in a workspace.
   */
  async list(workspacePath: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execFileAsync('git', [
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
    try {
      await fs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }
}
