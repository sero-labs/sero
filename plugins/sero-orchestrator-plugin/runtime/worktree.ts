// Worktree isolation (Phase 6, D-06) — a neutral work-item wrapper over the
// host git worktree API. The host signature is card-flavored
// (`createWorktree(workspacePath, cardId, cardTitle)`) and creates
// `.sero/worktrees/card-<id>` with branch `<type>/<slug>-<id>`; Orchestrator
// reuses it verbatim but speaks only "work item" at this seam, so no
// card-specific concept leaks into the coordinator. In-workspace worktrees work
// with the existing verification / command / subagent cwd mapping (02 §VCS);
// external worktrees would need runtime mount changes first (D-06), so they are
// out of scope here.

import type { AppRuntimeHost } from '@sero-ai/common';

import type { LoopGoal, LoopWorktree } from '../shared/types';

/**
 * A stable, filesystem-safe work-item id for a loop. Stripping the `loop-`
 * prefix keeps the physical `card-<id>` directory readable; it is deterministic
 * so the same loop always maps to the same worktree.
 */
export function workItemId(loop: LoopGoal): string {
  return loop.id.replace(/^loop-/, '');
}

/**
 * Resolve the loop's worktree, creating it on first use. The handle is recorded
 * on the loop (by the caller) and reused across attempts so the loop iterates
 * forward on one branch — the host `createWorktree` errors if the directory
 * already exists, so we only call it when the loop has no recorded worktree.
 */
export async function ensureLoopWorktree(
  host: AppRuntimeHost,
  workspacePath: string,
  loop: LoopGoal,
): Promise<LoopWorktree> {
  if (loop.worktree) return loop.worktree;
  const id = workItemId(loop);
  const created = await host.git.createWorktree(workspacePath, id, loop.title);
  return { workItemId: id, path: created.worktreePath, branch: created.branchName };
}

/**
 * Remove a loop's worktree directory (manual cleanup). Keeps the branch by
 * default so an open PR — or a user inspecting the work — is never orphaned.
 * No-op when the loop never isolated.
 */
export async function removeLoopWorktree(
  host: AppRuntimeHost,
  workspacePath: string,
  loop: LoopGoal,
  options: { deleteBranch?: boolean; force?: boolean } = {},
): Promise<void> {
  if (!loop.worktree) return;
  await host.git.removeWorktree(workspacePath, loop.worktree.workItemId, options);
}
