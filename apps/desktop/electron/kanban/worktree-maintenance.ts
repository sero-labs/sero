import { execFile } from 'child_process';
import { promisify } from 'util';

import type { KanbanState } from './types';
import { getPullRequestMergeState } from './pr-merge-status';

const execFileAsync = promisify(execFile);

interface WorktreeRemover {
  remove: (workspacePath: string, cardId: string, opts?: { deleteBranch?: boolean; force?: boolean }) => Promise<void>;
}

export interface WorkspaceSyncResult {
  synced: boolean;
  branch?: string;
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
  await fetchOrigin(workspacePath);

  const branch = await detectDefaultBranch(workspacePath);
  if (!branch) return null;

  if (await refExists(workspacePath, `refs/remotes/origin/${branch}`)) {
    return `origin/${branch}`;
  }
  if (await refExists(workspacePath, `refs/heads/${branch}`)) {
    return branch;
  }

  return null;
}

export async function syncWorkspaceRootToDefaultBranch(workspacePath: string): Promise<WorkspaceSyncResult> {
  await fetchOrigin(workspacePath);

  const branch = await detectDefaultBranch(workspacePath);
  if (!branch) {
    return { synced: false, reason: 'No default branch detected.' };
  }

  const meaningfulPaths = await getMeaningfulWorkspaceStatusPaths(workspacePath);
  if (meaningfulPaths.length > 0) {
    return {
      synced: false,
      branch,
      reason: `Workspace has local changes outside .sero/: ${meaningfulPaths.slice(0, 3).join(', ')}`,
    };
  }

  try {
    if (await refExists(workspacePath, `refs/heads/${branch}`)) {
      await execFileAsync('git', ['checkout', branch], {
        cwd: workspacePath,
        timeout: 15_000,
      });
    } else if (await refExists(workspacePath, `refs/remotes/origin/${branch}`)) {
      await execFileAsync('git', ['checkout', '-B', branch, `origin/${branch}`], {
        cwd: workspacePath,
        timeout: 15_000,
      });
    } else {
      return { synced: false, branch, reason: `Default branch "${branch}" is not available locally or on origin.` };
    }

    if (await refExists(workspacePath, `refs/remotes/origin/${branch}`)) {
      await execFileAsync('git', ['pull', '--ff-only', 'origin', branch], {
        cwd: workspacePath,
        timeout: 30_000,
      });
    }

    return { synced: true, branch };
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

async function fetchOrigin(workspacePath: string): Promise<void> {
  try {
    await execFileAsync('git', ['fetch', 'origin'], {
      cwd: workspacePath,
      timeout: 30_000,
    });
  } catch {
    // Best-effort — local-only repos are fine.
  }
}

async function detectDefaultBranch(workspacePath: string): Promise<string | null> {
  try {
    const result = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: workspacePath,
      timeout: 10_000,
    });
    const branch = result.stdout.trim().split('/').pop();
    if (branch) return branch;
  } catch {
    // Fall through to common names.
  }

  for (const branch of ['main', 'master']) {
    if (await refExists(workspacePath, `refs/remotes/origin/${branch}`)) return branch;
    if (await refExists(workspacePath, `refs/heads/${branch}`)) return branch;
  }

  return null;
}

async function refExists(workspacePath: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', ref], {
      cwd: workspacePath,
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function getMeaningfulWorkspaceStatusPaths(workspacePath: string): Promise<string[]> {
  try {
    const result = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: workspacePath,
      timeout: 15_000,
    });
    return result.stdout
      .split('\n')
      .map(extractStatusPath)
      .filter((relPath): relPath is string => !!relPath)
      .filter((relPath) => !isIgnoredWorkspaceStatusPath(relPath));
  } catch {
    return [];
  }
}
