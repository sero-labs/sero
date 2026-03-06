/**
 * Worktree git helpers — VCS operations scoped to a worktree directory.
 *
 * Unlike the main VcsManager which resolves cwd from workspaceId,
 * these functions take an explicit cwd (the worktree path) and
 * run git commands directly there.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Create a VCS checkpoint (git add + commit) in a worktree directory.
 *
 * @returns The short SHA of the new commit, or null if no changes to commit.
 */
export async function createCheckpointInWorktree(
  worktreePath: string,
  message: string,
): Promise<string | null> {
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
  } catch (err: any) {
    // Force-push if rejected (e.g. rebased branch)
    if (err?.stderr?.includes('rejected') || err?.stderr?.includes('non-fast-forward')) {
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
    console.error(`[worktree-git] Push failed for ${branchName}:`, err?.stderr || err?.message);
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

/**
 * Get the diff of all changes in a worktree from the branch base.
 *
 * Handles the empty-repo case (no commits yet) by diffing against
 * the git empty tree SHA.
 */
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
        maxBuffer: 10 * 1024 * 1024,
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
      maxBuffer: 10 * 1024 * 1024,
    });
    return diff.stdout;
  } catch {
    // Fallback: diff working tree against HEAD
    try {
      const diff = await execFileAsync('git', ['diff', 'HEAD'], {
        cwd: worktreePath,
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return diff.stdout;
    } catch {
      return '';
    }
  }
}

/** Fetch remote refs so origin/* is up to date for merge-base checks. */
async function fetchRemoteRefs(worktreePath: string): Promise<void> {
  try {
    await execFileAsync('git', ['fetch', 'origin'], {
      cwd: worktreePath,
      timeout: 30_000,
    });
  } catch {
    // Best-effort — remote may not exist yet
  }
}

/**
 * Ensure the remote has a default branch to serve as PR base.
 *
 * Strategy:
 * 1. Remote has main/master with shared history → use it.
 * 2. Otherwise → force-push main from the feature branch's root commit
 *    (guaranteed ancestor). Fixes broken/disconnected remote branches.
 */
export async function ensureRemoteDefaultBranch(worktreePath: string): Promise<string> {
  // 1. Check if remote already has a default branch that shares history
  //    with the current branch. A disconnected branch (e.g. from a
  //    previous failed empty-tree attempt) is treated as non-existent.
  await fetchRemoteRefs(worktreePath);
  for (const branch of ['main', 'master']) {
    try {
      const r = await execFileAsync('git', ['ls-remote', '--heads', 'origin', branch], {
        cwd: worktreePath,
        timeout: 15_000,
      });
      if (!r.stdout.trim()) continue;

      // Verify shared history — merge-base exits non-zero if none
      await execFileAsync('git', ['merge-base', `origin/${branch}`, 'HEAD'], {
        cwd: worktreePath,
        timeout: 10_000,
      });
      return branch;
    } catch { /* no shared history or doesn't exist — try next */ }
  }

  // 2. Remote has no usable default branch. Find the root commit of the
  //    feature branch — it's a guaranteed ancestor — and force-push it
  //    as 'main'. This also fixes a previously broken remote 'main'.
  console.log('[worktree-git] Setting up remote main from feature branch root commit');
  try {
    const rootResult = await execFileAsync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd: worktreePath,
      timeout: 10_000,
    });
    const rootCommit = rootResult.stdout.trim().split('\n')[0];

    if (rootCommit) {
      await execFileAsync('git', ['update-ref', 'refs/heads/main', rootCommit], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      // Force-push to overwrite any broken remote main
      await execFileAsync('git', ['push', '--force', '-u', 'origin', 'main'], {
        cwd: worktreePath,
        timeout: 30_000,
      });
      console.log(`[worktree-git] Created main at root commit ${rootCommit.slice(0, 12)} and pushed`);
      return 'main';
    }
  } catch (err: any) {
    console.error('[worktree-git] Failed to create default branch:', err?.message);
  }

  return 'main';
}

/**
 * Resolve the default branch name for PR base (must be a real branch, not a SHA).
 * Falls back to 'main' since GitHub defaults to that for new repos.
 */
async function resolveDefaultBranch(worktreePath: string): Promise<string> {
  // Try the remote's HEAD (most reliable)
  try {
    const r = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: worktreePath,
      timeout: 5_000,
    });
    const ref = r.stdout.trim(); // e.g. refs/remotes/origin/main
    const branch = ref.split('/').pop();
    if (branch) return branch;
  } catch { /* no remote HEAD */ }

  // Check if main or master exist locally or on remote
  for (const branch of ['main', 'master']) {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', `origin/${branch}`], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      return branch;
    } catch { /* try next */ }
    try {
      await execFileAsync('git', ['rev-parse', '--verify', branch], {
        cwd: worktreePath,
        timeout: 5_000,
      });
      return branch;
    } catch { /* try next */ }
  }

  // Last resort — GitHub defaults to 'main'
  return 'main';
}

/**
 * Create a PR using the `gh` CLI directly from a worktree.
 *
 * @returns Object with url + number if successful, or error message.
 */
export async function createPrFromWorktree(
  worktreePath: string,
  opts: { title: string; body: string; baseBranch?: string; draft?: boolean },
): Promise<{ success: true; url: string; number: number } | { success: false; error: string }> {
  const base = opts.baseBranch ?? await resolveDefaultBranch(worktreePath);

  const args = ['pr', 'create', '--base', base, '--title', opts.title, '--body', opts.body];
  if (opts.draft) args.push('--draft');

  try {
    const result = await execFileAsync('gh', args, {
      cwd: worktreePath,
      timeout: 120_000,
    });

    const url = extractGithubPrUrl(result.stdout) ?? extractGithubPrUrl(result.stderr);
    const prNumber = url ? extractPrNumber(url) : undefined;

    if (url && prNumber) {
      console.log(`[worktree-git] Created PR #${prNumber}: ${url}`);
      return { success: true, url, number: prNumber };
    }
    return { success: true, url: result.stdout.trim(), number: 0 };
  } catch (err: any) {
    const stderr = String(err?.stderr ?? err?.message ?? 'Unknown error');

    // Check if a PR already exists
    if (stderr.includes('already exists')) {
      const existing = await findExistingPr(worktreePath);
      if (existing) return { success: true, ...existing };
    }

    console.error('[worktree-git] PR creation failed:', stderr);
    return { success: false, error: stderr };
  }
}

/** Find an existing open PR for the current branch. */
async function findExistingPr(
  worktreePath: string,
): Promise<{ url: string; number: number } | null> {
  try {
    const result = await execFileAsync('gh', [
      'pr', 'view', '--json', 'url,number',
    ], { cwd: worktreePath, timeout: 30_000 });

    const parsed = JSON.parse(result.stdout) as { url?: string; number?: number };
    if (parsed.url && typeof parsed.number === 'number') {
      return { url: parsed.url, number: parsed.number };
    }
  } catch { /* no existing PR */ }
  return null;
}

function extractGithubPrUrl(text: string): string | undefined {
  return text.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
}

function extractPrNumber(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}
