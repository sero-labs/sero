/** Worktree git helpers — VCS operations scoped to a worktree directory. */

import { promises as fs } from 'fs';
import path from 'path';
import { WORKSPACE_COMMON_IGNORES } from '@sero-ai/common';
import { warnCleanupFailure } from '@electron/features/git/support/cleanup-warnings';
import { execWorktreeGit, execWorktreeGitCommit } from './exec';
import { ghError as execError } from '../github/helpers';
export { ensureRemoteDefaultBranch, createPrFromWorktree } from './pull-request';

/** Max buffer for git diff output (50MB — diffs can be large for greenfield projects). */
const DIFF_MAX_BUFFER = 50 * 1024 * 1024;

/** The well-known git empty-tree object — diff base for root commits. */
const EMPTY_TREE_REV = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';


/**
 * Create a VCS checkpoint (git add + commit) in a worktree directory.
 *
 * @returns The short SHA of the new commit, or null if no changes to commit.
 */
export async function createCheckpointInWorktree(
  worktreePath: string,
  message: string,
): Promise<string | null> {
  // Ensure common patterns are in .gitignore BEFORE checking status
  await ensureGitignore(worktreePath);

  // Remove .DS_Store from tracking if present (safe, targeted removal)
  try {
    await execWorktreeGit(['rm', '-r', '--cached', '--ignore-unmatch', '.DS_Store'], {
      cwd: worktreePath, timeout: 10_000,
    });
    // Also check subdirectories
    await execWorktreeGit(['rm', '-r', '--cached', '--ignore-unmatch', '**/.DS_Store'], {
      cwd: worktreePath, timeout: 10_000,
    });
  } catch { /* not tracked — fine */ }

  // Check if there are changes to commit
  const status = await execWorktreeGit(['status', '--porcelain'], {
    cwd: worktreePath,
    timeout: 10_000,
  });

  if (!status.stdout.trim()) {
    console.log(`[worktree-git] No changes to checkpoint in ${worktreePath}`);
    return null;
  }

  // Stage all changes
  await execWorktreeGit(['add', '-A'], {
    cwd: worktreePath,
    timeout: 15_000,
  });

  // Commit
  await execWorktreeGitCommit(['-m', message], {
    cwd: worktreePath,
    timeout: 15_000,
  });

  // Get the short SHA
  const sha = await execWorktreeGit(['rev-parse', '--short=12', 'HEAD'], {
    cwd: worktreePath,
    timeout: 5_000,
  });

  const commitSha = sha.stdout.trim();
  console.log(`[worktree-git] Checkpoint ${commitSha}: ${message}`);
  return commitSha;
}

/**
 * Push the worktree's current branch to the remote.
 *
 * @returns true if push succeeded, false otherwise.
 */
export async function pushWorktreeBranch(
  worktreePath: string,
  branchName: string,
): Promise<boolean> {
  try {
    await execWorktreeGit(['push', '-u', 'origin', branchName], {
      cwd: worktreePath,
      timeout: 60_000,
    });
    console.log(`[worktree-git] Pushed branch ${branchName}`);
    return true;
  } catch (err: unknown) {
    const { stderr, message } = execError(err);
    // Force-push if rejected (e.g. rebased branch)
    if (stderr.includes('rejected') || stderr.includes('non-fast-forward')) {
      try {
        await execWorktreeGit(['push', '-u', '--force-with-lease', 'origin', branchName], {
          cwd: worktreePath,
          timeout: 60_000,
        });
        console.log(`[worktree-git] Force-pushed branch ${branchName}`);
        return true;
      } catch {
        // fall through
      }
    }
    console.error(`[worktree-git] Push failed for ${branchName}:`, stderr || message);
    return false;
  }
}

/**
 * Get a compact file-level diff summary (name-status) for the worktree branch.
 */
export async function getWorktreeDiffSummary(worktreePath: string): Promise<string> {
  if (!await hasCommits(worktreePath)) {
    // No commits — list all tracked/untracked files as "Added"
    try {
      const result = await execWorktreeGit(['ls-files', '--others', '--exclude-standard'], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      return result.stdout.trim().split('\n').filter(Boolean).map((f) => `A\t${f}`).join('\n');
    } catch {
      return '';
    }
  }

  const base = await resolveBaseBranch(worktreePath);
  const isBranch = /^[a-zA-Z]/.test(base) || base.startsWith('HEAD');
  const diffSpec = isBranch ? `${base}...HEAD` : `${base}..HEAD`;
  try {
    const result = await execWorktreeGit(['diff', '--name-status', diffSpec], {
      cwd: worktreePath,
      timeout: 15_000,
    });
    return result.stdout.trim();
  } catch {
    return '';
  }
}

export interface WorktreeDiffStat {
  files: number;
  additions: number;
  deletions: number;
}

/**
 * Aggregate +adds −dels of the branch's work relative to its base (the Agent
 * Board card stat). Fail-soft to null when the path is not a repo or has no
 * commits — the card simply omits the stat.
 */
export async function getWorktreeDiffStat(worktreePath: string): Promise<WorktreeDiffStat | null> {
  if (!await hasCommits(worktreePath)) return null;
  const base = await resolveBaseBranch(worktreePath);
  const isBranch = /^[a-zA-Z]/.test(base) || base.startsWith('HEAD');
  const diffSpec = isBranch ? `${base}...HEAD` : `${base}..HEAD`;
  try {
    const result = await execWorktreeGit(['diff', '--shortstat', diffSpec], {
      cwd: worktreePath,
      timeout: 15_000,
    });
    return parseShortstat(result.stdout);
  } catch {
    return null;
  }
}

/** Parses `git diff --shortstat` output ("3 files changed, 10 insertions(+), 2 deletions(-)"). */
function parseShortstat(stdout: string): WorktreeDiffStat | null {
  const text = stdout.trim();
  if (!text) return { files: 0, additions: 0, deletions: 0 };
  const files = /(\d+) files? changed/.exec(text);
  const additions = /(\d+) insertions?\(\+\)/.exec(text);
  const deletions = /(\d+) deletions?\(-\)/.exec(text);
  if (!files && !additions && !deletions) return null;
  return {
    files: files ? Number(files[1]) : 0,
    additions: additions ? Number(additions[1]) : 0,
    deletions: deletions ? Number(deletions[1]) : 0,
  };
}

/** Check whether the repo has any commits at all. */
async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await execWorktreeGit(['rev-parse', 'HEAD'], { cwd, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Resolve the base branch (main/master) for comparisons. */
async function resolveBaseBranch(worktreePath: string): Promise<string> {
  const branchChecks = await Promise.all(['main', 'master'].map(async (branch) => {
    const r = await execWorktreeGit(['rev-parse', '--verify', branch], {
        cwd: worktreePath,
        timeout: 5_000,
      }).catch(() => null);
    return r?.stdout.trim() ? branch : null;
  }));
  const branch = branchChecks.find((candidate): candidate is string => candidate !== null);
  if (branch) return branch;

  // No main/master — check if HEAD~1 exists (more than one commit)
  try {
    const r = await execWorktreeGit(['rev-parse', '--verify', 'HEAD~1'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    if (r.stdout.trim()) return 'HEAD~1';
  } catch { /* single commit or empty repo */ }

  // Single commit (root) — use the empty tree so diff shows all files
  return EMPTY_TREE_REV;
}

/** Get the diff of all changes in a worktree from the branch base. */
export async function getWorktreeDiff(worktreePath: string): Promise<string> {
  if (!await hasCommits(worktreePath)) {
    // No commits — diff all files against the empty tree
    // First stage everything so diff-index can see it
    try {
      await execWorktreeGit(['add', '-A'], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      // 4b825dc... is the well-known empty tree SHA in git
      const emptyTree = await execWorktreeGit(['hash-object', '-t', 'tree', '/dev/null'], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      const diff = await execWorktreeGit(['diff', '--cached', emptyTree.stdout.trim()], {
        cwd: worktreePath,
        timeout: 30_000,
        maxBuffer: DIFF_MAX_BUFFER,
      });
      // Unstage to avoid side effects
      try {
        await execWorktreeGit(['reset'], { cwd: worktreePath, timeout: 10_000 });
      } catch (error) {
        warnCleanupFailure(`failed to reset staged diff state in ${worktreePath}`, error);
      }
      return diff.stdout;
    } catch {
      return '';
    }
  }

  const base = await resolveBaseBranch(worktreePath);

  // Use three-dot syntax for branch names (merge-base), two-dot for raw SHAs
  const isBranch = /^[a-zA-Z]/.test(base) || base.startsWith('HEAD');
  const diffSpec = isBranch ? `${base}...HEAD` : `${base}..HEAD`;

  try {
    const diff = await execWorktreeGit(['diff', diffSpec], {
      cwd: worktreePath,
      timeout: 30_000,
      maxBuffer: DIFF_MAX_BUFFER,
    });
    return diff.stdout;
  } catch (err) {
    console.warn(`[worktree-git] git diff ${diffSpec} failed:`, (err as Error)?.message?.slice(0, 200));
    // Fallback: diff working tree against HEAD
    try {
      const diff = await execWorktreeGit(['diff', 'HEAD'], {
        cwd: worktreePath,
        timeout: 30_000,
        maxBuffer: DIFF_MAX_BUFFER,
      });
      return diff.stdout;
    } catch {
      return '';
    }
  }
}

// ── Gitignore ────────────────────────────────────────────────

/**
 * Common .gitignore patterns that should always be present.
 * Prevents massive diffs from committed node_modules, dist, etc.
 */
const COMMON_IGNORE_PATTERNS = WORKSPACE_COMMON_IGNORES;

/**
 * Ensure common patterns are in the worktree's .gitignore.
 * Only ADDS patterns — never removes tracked files from the index.
 * The dangerous `git rm --cached` approach was removed because if
 * the re-add fails, it nukes all source files from the commit.
 */
async function ensureGitignore(worktreePath: string): Promise<void> {
  const gitignorePath = path.join(worktreePath, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readFile(gitignorePath, 'utf8');
  } catch { /* file doesn't exist yet */ }

  const missing = COMMON_IGNORE_PATTERNS.filter(
    (pattern) => !existing.includes(pattern),
  );
  if (missing.length === 0) return;

  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  const additions = `${separator}# Auto-added by kanban orchestrator\n${missing.join('\n')}\n`;
  await fs.writeFile(gitignorePath, existing + additions, 'utf8');
}
