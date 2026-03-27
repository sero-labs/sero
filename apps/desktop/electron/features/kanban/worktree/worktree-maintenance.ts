import { execFile } from 'child_process';
import { promisify } from 'util';

import type { KanbanState } from '../core/types';
import { getPullRequestMergeState } from '../quality/pr-merge-status';

const execFileAsync = promisify(execFile);

interface GitRunner {
  run: (workspacePath: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>;
}

const defaultGitRunner: GitRunner = {
  async run(workspacePath, args, timeoutMs = 30_000) {
    const result = await execFileAsync('git', args, {
      cwd: workspacePath,
      timeout: timeoutMs,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

interface WorktreeRemover {
  remove: (workspacePath: string, cardId: string, opts?: { deleteBranch?: boolean; force?: boolean }) => Promise<void>;
}

export interface WorkspaceSyncResult {
  synced: boolean;
  branch?: string;
  headChanged?: boolean;
  reason?: string;
}

export interface WorktreeMaintenanceResult {
  cleanedCardIds: string[];
  sync: WorkspaceSyncResult;
}

export async function maintainWorkspaceForNewCard(
  workspacePath: string,
  state: KanbanState | null,
  worktreeRemover: WorktreeRemover,
): Promise<WorktreeMaintenanceResult> {
  const cleanedCardIds = await cleanupMergedDoneCardWorktrees(workspacePath, state, worktreeRemover);
  const sync = await syncWorkspaceRootToDefaultBranch(workspacePath);
  return { cleanedCardIds, sync };
}

export async function resolvePreferredBaseRef(workspacePath: string): Promise<string | null> {
  await fetchOrigin(workspacePath, defaultGitRunner);

  const branch = await detectDefaultBranch(workspacePath, defaultGitRunner);
  if (!branch) return null;

  if (await refExists(workspacePath, `refs/remotes/origin/${branch}`, defaultGitRunner)) {
    return `origin/${branch}`;
  }
  if (await refExists(workspacePath, `refs/heads/${branch}`, defaultGitRunner)) {
    return branch;
  }

  return null;
}

export async function syncWorkspaceRootToDefaultBranch(
  workspacePath: string,
  runner: GitRunner = defaultGitRunner,
): Promise<WorkspaceSyncResult> {
  await fetchOrigin(workspacePath, runner);

  const branch = await detectDefaultBranch(workspacePath, runner);
  if (!branch) {
    return { synced: false, reason: 'No default branch detected.' };
  }

  const meaningfulPaths = await getMeaningfulWorkspaceStatusPaths(workspacePath, runner);
  if (meaningfulPaths.length > 0) {
    return {
      synced: false,
      branch,
      reason: `Workspace has local changes outside .sero/: ${meaningfulPaths.slice(0, 3).join(', ')}`,
    };
  }

  try {
    const headBefore = await resolveRef(workspacePath, 'HEAD', runner);
    const remoteRef = await refExists(workspacePath, `refs/remotes/origin/${branch}`, runner)
      ? `origin/${branch}`
      : null;
    const localBranchExists = await refExists(workspacePath, `refs/heads/${branch}`, runner);

    if (localBranchExists) {
      await runner.run(workspacePath, ['checkout', branch], 15_000);
    } else if (remoteRef) {
      await runner.run(workspacePath, ['checkout', '-B', branch, remoteRef], 15_000);
    } else {
      return { synced: false, branch, reason: `Default branch "${branch}" is not available locally or on origin.` };
    }

    if (!remoteRef) {
      const headAfter = await resolveRef(workspacePath, 'HEAD', runner);
      return { synced: true, branch, headChanged: headBefore !== headAfter };
    }

    const localHead = await resolveRef(workspacePath, 'HEAD', runner);
    const remoteHead = await resolveRef(workspacePath, remoteRef, runner);
    if (localHead && remoteHead && localHead !== remoteHead) {
      await runner.run(workspacePath, ['merge', '--ff-only', remoteRef], 30_000);
    }

    const headAfter = await resolveRef(workspacePath, 'HEAD', runner);
    return { synced: true, branch, headChanged: headBefore !== headAfter };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { synced: false, branch, reason: message };
  }
}

export function extractStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pathPart = line.slice(3).trim();
  if (!pathPart) return null;
  if (pathPart.includes(' -> ')) {
    const [, dest] = pathPart.split(' -> ');
    return dest?.trim() || null;
  }
  return pathPart;
}

export function isIgnoredWorkspaceStatusPath(relPath: string): boolean {
  return relPath === '.sero-workspace.json' || relPath.startsWith('.sero/');
}

async function cleanupMergedDoneCardWorktrees(
  workspacePath: string,
  state: KanbanState | null,
  worktreeRemover: WorktreeRemover,
): Promise<string[]> {
  if (!state?.cards?.length) return [];

  const cleanedCardIds: string[] = [];

  for (const card of state.cards) {
    if (card.column !== 'done' || !card.worktreePath || !card.prNumber) continue;

    const mergeState = await getPullRequestMergeState(workspacePath, card.prNumber);
    if (mergeState !== 'merged') continue;

    await worktreeRemover.remove(workspacePath, card.id, {
      deleteBranch: true,
      force: true,
    });
    cleanedCardIds.push(card.id);
  }

  return cleanedCardIds;
}

async function fetchOrigin(workspacePath: string, runner: GitRunner): Promise<void> {
  try {
    await runner.run(workspacePath, ['fetch', 'origin'], 30_000);
  } catch {
    // Best-effort — local-only repos are fine.
  }
}

async function detectDefaultBranch(workspacePath: string, runner: GitRunner): Promise<string | null> {
  try {
    const result = await runner.run(workspacePath, ['symbolic-ref', 'refs/remotes/origin/HEAD'], 10_000);
    const branch = result.stdout.trim().split('/').pop();
    if (branch) return branch;
  } catch {
    // Fall through to common names.
  }

  for (const branch of ['main', 'master']) {
    if (await refExists(workspacePath, `refs/remotes/origin/${branch}`, runner)) return branch;
    if (await refExists(workspacePath, `refs/heads/${branch}`, runner)) return branch;
  }

  return null;
}

async function refExists(workspacePath: string, ref: string, runner: GitRunner): Promise<boolean> {
  try {
    await runner.run(workspacePath, ['rev-parse', '--verify', ref], 10_000);
    return true;
  } catch {
    return false;
  }
}

async function resolveRef(workspacePath: string, ref: string, runner: GitRunner): Promise<string | null> {
  try {
    const result = await runner.run(workspacePath, ['rev-parse', '--verify', ref], 10_000);
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getMeaningfulWorkspaceStatusPaths(workspacePath: string, runner: GitRunner): Promise<string[]> {
  try {
    const result = await runner.run(workspacePath, ['status', '--porcelain', '--untracked-files=all'], 15_000);
    return result.stdout
      .split('\n')
      .map(extractStatusPath)
      .filter((relPath): relPath is string => !!relPath)
      .filter((relPath) => !isIgnoredWorkspaceStatusPath(relPath));
  } catch {
    return [];
  }
}
