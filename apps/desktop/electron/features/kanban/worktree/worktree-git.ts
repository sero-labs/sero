/** Worktree git helpers — VCS operations scoped to a worktree directory. */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
export { ensureRemoteDefaultBranch, createPrFromWorktree } from './worktree-pr';

const execFileAsync = promisify(execFile);

/** Max buffer for git diff output (50MB — diffs can be large for greenfield projects). */
const DIFF_MAX_BUFFER = 50 * 1024 * 1024;

/** Extract stderr and message from an execFile error. */
function execError(err: unknown): { stderr: string; message: string } {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: unknown; message?: unknown };
    return {
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
      message: typeof e.message === 'string' ? e.message : String(err),
    };
  }
  return { stderr: '', message: String(err) };
}

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
    await execFileAsync('git', ['rm', '-r', '--cached', '--ignore-unmatch', '.DS_Store'], {
      cwd: worktreePath, timeout: 10_000,
    });
    // Also check subdirectories
    await execFileAsync('git', ['rm', '-r', '--cached', '--ignore-unmatch', '**/.DS_Store'], {
      cwd: worktreePath, timeout: 10_000,
    });
  } catch { /* not tracked — fine */ }

  // Check if there are changes to commit
  const status = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: worktreePath,
    timeout: 10_000,
  });

  if (!status.stdout.trim()) {
    console.log(`[worktree-git] No changes to checkpoint in ${worktreePath}`);
    return null;
  }

  // Stage all changes
  await execFileAsync('git', ['add', '-A'], {
    cwd: worktreePath,
    timeout: 15_000,
  });

  // Commit
  await execFileAsync('git', ['commit', '-m', message], {
    cwd: worktreePath,
    timeout: 15_000,
  });

  // Get the short SHA
  const sha = await execFileAsync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: worktreePath,
    timeout: 5_000,
  });

  const changeId = sha.stdout.trim();
  console.log(`[worktree-git] Checkpoint ${changeId}: ${message}`);
  return changeId;
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
    await execFileAsync('git', ['push', '-u', 'origin', branchName], {
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
        await execFileAsync('git', ['push', '-u', '--force-with-lease', 'origin', branchName], {
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
      const result = await execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], {
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
    const result = await execFileAsync('git', ['diff', '--name-status', diffSpec], {
      cwd: worktreePath,
      timeout: 15_000,
    });
    return result.stdout.trim();
  } catch {
    return '';
  }
}

/** Check whether the repo has any commits at all. */
async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Resolve the base branch (main/master) for comparisons. */
async function resolveBaseBranch(worktreePath: string): Promise<string> {
  for (const branch of ['main', 'master']) {
    try {
      const r = await execFileAsync('git', ['rev-parse', '--verify', branch], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      if (r.stdout.trim()) return branch;
    } catch { /* try next */ }
  }

  // No main/master — check if HEAD~1 exists (more than one commit)
  try {
    const r = await execFileAsync('git', ['rev-parse', '--verify', 'HEAD~1'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    if (r.stdout.trim()) return 'HEAD~10';
  } catch { /* single commit or empty repo */ }

  // Single commit (root) — use the empty tree so diff shows all files
  try {
    const r = await execFileAsync('git', ['hash-object', '-t', 'tree', '/dev/null'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    return r.stdout.trim();
  } catch {
    return 'HEAD~10';
  }
}

/** Get the diff of all changes in a worktree from the branch base. */
export async function getWorktreeDiff(worktreePath: string): Promise<string> {
  if (!await hasCommits(worktreePath)) {
    // No commits — diff all files against the empty tree
    // First stage everything so diff-index can see it
    try {
      await execFileAsync('git', ['add', '-A'], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      // 4b825dc... is the well-known empty tree SHA in git
      const emptyTree = await execFileAsync('git', ['hash-object', '-t', 'tree', '/dev/null'], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      const diff = await execFileAsync('git', ['diff', '--cached', emptyTree.stdout.trim()], {
        cwd: worktreePath,
        timeout: 30_000,
        maxBuffer: DIFF_MAX_BUFFER,
      });
      // Unstage to avoid side effects
      await execFileAsync('git', ['reset'], { cwd: worktreePath, timeout: 10_000 }).catch(() => {});
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
    const diff = await execFileAsync('git', ['diff', diffSpec], {
      cwd: worktreePath,
      timeout: 30_000,
      maxBuffer: DIFF_MAX_BUFFER,
    });
    return diff.stdout;
  } catch (err) {
    console.warn(`[worktree-git] git diff ${diffSpec} failed:`, (err as Error)?.message?.slice(0, 200));
    // Fallback: diff working tree against HEAD
    try {
      const diff = await execFileAsync('git', ['diff', 'HEAD'], {
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
const COMMON_IGNORE_PATTERNS = [
  'node_modules/',
  'dist/',
  'build/',
  '.DS_Store',
  '*.log',
  '.env',
  '.env.local',
  'coverage/',
  '.sero/',
  '.sero-workspace.json',
  '__pycache__/',
  '*.pyc',
  'target/',
  '.next/',
  '.nuxt/',
  '.turbo/',
];

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
