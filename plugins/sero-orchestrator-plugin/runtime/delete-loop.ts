/**
 * Loop deletion: drop the loop's managed worktree, then remove the loop from
 * state. Split out of coordinator.ts to keep that file under 500 LOC.
 */

import type { Loop, OrchestratorActionResult } from '../shared/types';
import type { OrchestratorHost } from './host';

export async function deleteLoop(
  host: OrchestratorHost,
  loop: Loop,
  deleteBranch?: boolean,
): Promise<OrchestratorActionResult> {
  const resolved = loop.runtime.workspace.resolved;
  if (resolved?.type === 'managed-worktree') {
    // An event-pr worktree's branch belongs to a PR, never to this loop —
    // deleteBranch must not reach it (spec 15, FR-P2).
    await host.removeWorktree(resolved.worktreeKey ?? loop.id, {
      force: true,
      deleteBranch: resolved.externalBranch ? undefined : deleteBranch,
    });
  }
  await host.updateState((state) => ({
    ...state,
    loops: state.loops.filter((l) => l.id !== loop.id),
  }));
  host.log(`Deleted loop ${loop.id}`);
  return { ok: true };
}
