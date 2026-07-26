/**
 * What the Git app needs to offer AI conflict resolution: the run's state, and
 * one callback that starts it.
 *
 * Kept out of `GitApp` because the wiring is all context-building — where the
 * file lives on disk, how to stage it — and none of it is layout.
 *
 * The AI marks are **not persisted**. §7 originally wanted them readable "a week
 * later"; git history already records who resolved what, and marks that outlived
 * the run without the account explaining them would be half a state. They live
 * with the run, and the run lives with the merge.
 */

import { useCallback, useEffect } from 'react';
import { useConflictRun } from './conflict-run';
import { toWorkspacePath } from '../lib/repo-paths';
import type { GitManagerRequest } from '../../shared/types';

interface Params {
  workspaceId: string;
  workspacePath: string;
  repoPath: string;
  /** Repo-relative paths git still calls conflicted. */
  conflictPaths: string[];
  merging: boolean;
  /** Resolves when git has finished, so the run can keep its actions serial. */
  onAction: (action: GitManagerRequest) => Promise<boolean>;
}

export function useAiResolution({
  workspaceId, workspacePath, repoPath, conflictPaths, merging, onAction,
}: Params) {
  const status = useConflictRun((state) => state.status);
  const entries = useConflictRun((state) => state.entries);
  const aiResolvedPaths = useConflictRun((state) => state.aiResolvedPaths);
  const reset = useConflictRun((state) => state.reset);

  // The run belongs to one merge. When the merge ends — concluded or aborted —
  // its account and its marks go with it, or they would reappear over the next
  // merge's files. This is the external side effect a store cannot see.
  useEffect(() => {
    if (!merging && status !== 'idle') reset();
  }, [merging, reset, status]);

  const start = useCallback(() => {
    useConflictRun.getState().start(
      {
        workspaceId,
        toDiskPath: (path) => toWorkspacePath(workspacePath, repoPath, path),
        onStage: async (path) => { await onAction({ action: 'stage', file: path }); },
        onRestoreConflict: async (path) => {
          await onAction({ action: 'restore_conflict', file: path });
        },
      },
      conflictPaths,
    );
  }, [conflictPaths, onAction, repoPath, workspaceId, workspacePath]);

  return { status, entries, aiResolvedPaths, start };
}
