/**
 * What the Git app needs to offer AI conflict resolution: the run's state, and
 * one callback that starts it.
 *
 * Kept out of `GitApp` because the wiring is all context-building — where the
 * file lives on disk, how to stage it — and none of it is layout.
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
  /** What is being merged in — what the marks are keyed by. */
  mergeRef: string | null | undefined;
  /** Resolves when git has finished, so the run can keep its actions serial. */
  onAction: (action: GitManagerRequest) => Promise<boolean>;
  /** The plugin's own per-workspace view state, where the marks are kept. */
  aiResolvedStore: {
    stored: { mergeRef: string; paths: string[] } | undefined;
    save: (next: { mergeRef: string; paths: string[] } | undefined) => void;
  };
}

export function useAiResolution({
  workspaceId, workspacePath, repoPath, conflictPaths, merging, mergeRef, onAction, aiResolvedStore,
}: Params) {
  const status = useConflictRun((state) => state.status);
  const entries = useConflictRun((state) => state.entries);
  const runPaths = useConflictRun((state) => state.aiResolvedPaths);
  const unresolvedPaths = useConflictRun((state) => state.unresolvedPaths);
  const reset = useConflictRun((state) => state.reset);

  // The run belongs to one merge. When the merge ends — concluded or aborted —
  // its account and its marks go with it, or they would reappear over the next
  // merge's files. This is the external side effect a store cannot see.
  useEffect(() => {
    if (merging) return;
    if (status !== 'idle') reset();
    if (aiResolvedStore.stored) aiResolvedStore.save(undefined);
  }, [aiResolvedStore, merging, reset, status]);

  // The run itself is in memory, so a reload mid-merge would otherwise forget
  // whose resolution each file holds.
  //
  // Once a run has happened its list is authoritative **even when it is
  // empty** — that is what undo leaves behind. Writing only non-empty lists
  // meant undo cleared the store but not the file, and the fallback below then
  // resurrected the marks it had just taken away.
  useEffect(() => {
    if (!merging || !mergeRef || status === 'idle') return;
    const stored = aiResolvedStore.stored;
    if (stored?.mergeRef === mergeRef && sameSet(stored.paths, runPaths)) return;
    aiResolvedStore.save({ mergeRef, paths: runPaths });
  }, [aiResolvedStore, merging, mergeRef, runPaths, status]);

  // With no run in memory — a reload mid-merge — the stored list stands in,
  // and only for the merge it was written during.
  const stored = aiResolvedStore.stored;
  const aiResolvedPaths = status !== 'idle'
    ? runPaths
    : (merging && stored && stored.mergeRef === mergeRef ? stored.paths : []);

  const start = useCallback(() => {
    useConflictRun.getState().start(
      {
        workspaceId,
        toDiskPath: (path) => toWorkspacePath(workspacePath, repoPath, path),
        onStage: async (path) => { await onAction({ action: 'stage', file: path }); },
        onUnstage: async (path) => { await onAction({ action: 'unstage', file: path }); },
      },
      conflictPaths,
    );
  }, [conflictPaths, onAction, repoPath, workspaceId, workspacePath]);

  return { status, entries, aiResolvedPaths, unresolvedPaths, start };
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}
