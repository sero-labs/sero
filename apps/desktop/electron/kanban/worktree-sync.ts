import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MAX_CONFLICT_RESOLUTION_ATTEMPTS = 10;

export interface GitRunner {
  run: (worktreePath: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>;
}

export interface ConflictResolutionContext {
  attempt: number;
  baseBranch: string;
  upstreamRef: string;
  conflictFiles: string[];
}

export interface WorktreeSyncOptions {
  resolveConflicts?: (context: ConflictResolutionContext) => Promise<boolean>;
  runner?: GitRunner;
}

export interface WorktreeSyncResult {
  success: boolean;
  baseBranch?: string;
  upstreamRef?: string;
  updated: boolean;
  resolvedConflicts: boolean;
  error?: string;
}

const defaultRunner: GitRunner = {
  async run(worktreePath, args, timeoutMs = 30_000) {
    const result = await execFileAsync('git', args, {
      cwd: worktreePath,
      timeout: timeoutMs,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

export async function syncWorktreeBranchWithDefaultBranch(
  worktreePath: string,
  options: WorktreeSyncOptions = {},
): Promise<WorktreeSyncResult> {
  const runner = options.runner ?? defaultRunner;

  await configureRerere(worktreePath, runner);
  await fetchOrigin(worktreePath, runner);

  const baseBranch = await detectDefaultBranch(worktreePath, runner);
  if (!baseBranch) {
    return {
      success: false,
      updated: false,
      resolvedConflicts: false,
      error: 'Could not detect a default branch to sync against.',
    };
  }

  const upstreamRef = await resolveUpstreamRef(worktreePath, baseBranch, runner);
  if (!upstreamRef) {
    return {
      success: false,
      baseBranch,
      updated: false,
      resolvedConflicts: false,
      error: `Default branch "${baseBranch}" is not available locally or on origin.`,
    };
  }

  const alreadySynced = await isAncestor(worktreePath, upstreamRef, 'HEAD', runner);
  if (alreadySynced) {
    return {
      success: true,
      baseBranch,
      upstreamRef,
      updated: false,
      resolvedConflicts: false,
    };
  }

  const rebaseResult = await attemptRebase(worktreePath, upstreamRef, runner);
  if (rebaseResult.success) {
    return {
      success: true,
      baseBranch,
      upstreamRef,
      updated: true,
      resolvedConflicts: false,
    };
  }

  if (!rebaseResult.conflictFiles?.length) {
    await abortRebase(worktreePath, runner);
    return {
      success: false,
      baseBranch,
      upstreamRef,
      updated: true,
      resolvedConflicts: false,
      error: rebaseResult.error,
    };
  }

  if (!options.resolveConflicts) {
    await abortRebase(worktreePath, runner);
    return {
      success: false,
      baseBranch,
      upstreamRef,
      updated: true,
      resolvedConflicts: false,
      error: `Rebase onto ${baseBranch} hit conflicts in ${rebaseResult.conflictFiles.join(', ')}.`,
    };
  }

  for (let attempt = 1; attempt <= MAX_CONFLICT_RESOLUTION_ATTEMPTS; attempt++) {
    const conflictFiles = await listConflictFiles(worktreePath, runner);
    if (conflictFiles.length === 0) {
      break;
    }

    const resolved = await options.resolveConflicts({
      attempt,
      baseBranch,
      upstreamRef,
      conflictFiles,
    });
    if (!resolved) {
      await abortRebase(worktreePath, runner);
      return {
        success: false,
        baseBranch,
        upstreamRef,
        updated: true,
        resolvedConflicts: false,
        error: `Automatic conflict resolution failed while rebasing onto ${baseBranch}.`,
      };
    }

    await stageAll(worktreePath, runner);
    const unresolvedFiles = await listConflictFiles(worktreePath, runner);
    if (unresolvedFiles.length > 0) {
      await abortRebase(worktreePath, runner);
      return {
        success: false,
        baseBranch,
        upstreamRef,
        updated: true,
        resolvedConflicts: false,
        error: `Conflict markers remain after auto-resolution: ${unresolvedFiles.join(', ')}.`,
      };
    }

    const continueResult = await continueRebase(worktreePath, runner);
    if (continueResult.success) {
      return {
        success: true,
        baseBranch,
        upstreamRef,
        updated: true,
        resolvedConflicts: true,
      };
    }

    if (!continueResult.conflictFiles?.length) {
      await abortRebase(worktreePath, runner);
      return {
        success: false,
        baseBranch,
        upstreamRef,
        updated: true,
        resolvedConflicts: false,
        error: continueResult.error,
      };
    }
  }

  await abortRebase(worktreePath, runner);
  return {
    success: false,
    baseBranch,
    upstreamRef,
    updated: true,
    resolvedConflicts: false,
    error: `Automatic conflict resolution exceeded ${MAX_CONFLICT_RESOLUTION_ATTEMPTS} attempts.`,
  };
}

interface RebaseAttemptResult {
  success: boolean;
  conflictFiles?: string[];
  error?: string;
}

async function configureRerere(worktreePath: string, runner: GitRunner): Promise<void> {
  try {
    await runner.run(worktreePath, ['config', 'rerere.enabled', 'true'], 10_000);
  } catch {
    // Best-effort only.
  }
}

async function fetchOrigin(worktreePath: string, runner: GitRunner): Promise<void> {
  try {
    await runner.run(worktreePath, ['fetch', 'origin'], 30_000);
  } catch {
    // Best-effort — local-only repos are fine.
  }
}

async function detectDefaultBranch(worktreePath: string, runner: GitRunner): Promise<string | null> {
  try {
    const result = await runner.run(worktreePath, ['symbolic-ref', 'refs/remotes/origin/HEAD'], 10_000);
    const branch = result.stdout.trim().split('/').pop();
    if (branch) return branch;
  } catch {
    // Fall through to common branch names.
  }

  for (const branch of ['main', 'master']) {
    if (await refExists(worktreePath, `refs/remotes/origin/${branch}`, runner)) return branch;
    if (await refExists(worktreePath, `refs/heads/${branch}`, runner)) return branch;
  }

  return null;
}

async function resolveUpstreamRef(
  worktreePath: string,
  baseBranch: string,
  runner: GitRunner,
): Promise<string | null> {
  if (await refExists(worktreePath, `refs/remotes/origin/${baseBranch}`, runner)) {
    return `origin/${baseBranch}`;
  }
  if (await refExists(worktreePath, `refs/heads/${baseBranch}`, runner)) {
    return baseBranch;
  }
  return null;
}

async function refExists(worktreePath: string, ref: string, runner: GitRunner): Promise<boolean> {
  try {
    await runner.run(worktreePath, ['rev-parse', '--verify', ref], 10_000);
    return true;
  } catch {
    return false;
  }
}

async function isAncestor(
  worktreePath: string,
  ancestorRef: string,
  descendantRef: string,
  runner: GitRunner,
): Promise<boolean> {
  try {
    await runner.run(worktreePath, ['merge-base', '--is-ancestor', ancestorRef, descendantRef], 10_000);
    return true;
  } catch {
    return false;
  }
}

async function attemptRebase(
  worktreePath: string,
  upstreamRef: string,
  runner: GitRunner,
): Promise<RebaseAttemptResult> {
  try {
    await runner.run(worktreePath, ['rebase', upstreamRef], 60_000);
    return { success: true };
  } catch (err: unknown) {
    const conflictFiles = await listConflictFiles(worktreePath, runner);
    if (conflictFiles.length > 0) {
      return { success: false, conflictFiles };
    }
    return { success: false, error: extractErrorMessage(err) };
  }
}

async function continueRebase(
  worktreePath: string,
  runner: GitRunner,
): Promise<RebaseAttemptResult> {
  try {
    await runner.run(worktreePath, ['-c', 'core.editor=true', 'rebase', '--continue'], 60_000);
    return { success: true };
  } catch (err: unknown) {
    const message = extractErrorMessage(err);
    if (message.includes('previous cherry-pick is now empty') || message.includes('No changes - did you forget to use')) {
      try {
        await runner.run(worktreePath, ['rebase', '--skip'], 30_000);
        return { success: true };
      } catch (skipErr: unknown) {
        return { success: false, error: extractErrorMessage(skipErr) };
      }
    }

    const conflictFiles = await listConflictFiles(worktreePath, runner);
    if (conflictFiles.length > 0) {
      return { success: false, conflictFiles };
    }
    return { success: false, error: message };
  }
}

async function listConflictFiles(worktreePath: string, runner: GitRunner): Promise<string[]> {
  try {
    const result = await runner.run(worktreePath, ['diff', '--name-only', '--diff-filter=U'], 10_000);
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function stageAll(worktreePath: string, runner: GitRunner): Promise<void> {
  await runner.run(worktreePath, ['add', '-A'], 15_000);
}

async function abortRebase(worktreePath: string, runner: GitRunner): Promise<void> {
  try {
    await runner.run(worktreePath, ['rebase', '--abort'], 15_000);
  } catch {
    // Best-effort cleanup.
  }
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const error = err as { stderr?: unknown; message?: unknown };
    if (typeof error.stderr === 'string' && error.stderr.trim()) return error.stderr.trim();
    if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  }
  return String(err);
}
