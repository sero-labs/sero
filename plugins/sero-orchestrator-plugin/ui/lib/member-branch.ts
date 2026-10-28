/**
 * Merging a finished Room's member branch into the workspace (#654).
 *
 * Members edit in their own worktrees, so a Room's work can end on a member
 * branch while the user's files are untouched. The Delivered row names those
 * branches; this is the one-click half of the fix.
 *
 * It calls the same `sero:vcs:run` entry the Git app uses, so a merge here is
 * the merge the Git app would perform, with the same guards and the same
 * conflict handling — not a second implementation of merging.
 */

export interface MergeOutcome {
  ok: boolean;
  message: string;
}

type VcsRun = (
  workspaceId: string,
  params: { action: 'merge'; branch: string },
) => Promise<MergeOutcome>;

/**
 * The branches a Room's result row can bring into the workspace.
 *
 * Absent on a host too old to carry `run`, which answers with a message the
 * caller shows the same way it shows any other refusal.
 */
export async function mergeMemberBranch(workspaceId: string, branch: string): Promise<MergeOutcome> {
  // SAFETY: the preload bridge defines `sero.vcs.run(workspaceId, params)`
  // (`sero:vcs:run`). TypeScript cannot see it because this module is compiled
  // without the desktop preload types, so the shape is asserted here and every
  // read below is guarded by a runtime check.
  const vcs = (window as unknown as { sero?: { vcs?: { run?: VcsRun } } }).sero?.vcs;
  if (typeof vcs?.run !== 'function') {
    return { ok: false, message: 'This version of Sero cannot merge from here. Merge the branch in the Git app.' };
  }
  try {
    return await vcs.run(workspaceId, { action: 'merge', branch });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
