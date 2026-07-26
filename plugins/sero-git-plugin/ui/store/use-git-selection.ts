/**
 * What the panes are showing: the commit picked out of the history, the file
 * open in the diff, whether the right pane is composing a pull request, and
 * the branch a dirty working tree is being asked to switch to.
 *
 * These four move together — picking a commit clears the diff, opening the PR
 * composer closes it, starting an AI run clears all three — which is why they
 * are one hook rather than four pieces of state in the app file.
 */

import { useCallback, useMemo, useState } from 'react';

import type {
  CommitNode,
  FileDiff,
  GitAppState,
  GitManagerRequest,
} from '../../shared/types';
import type { DiffSelection } from '../components/diff/DiffPane';
import type { SwitchStrategy } from '../components/app/SwitchBranchDialog';

interface Options {
  state: GitAppState;
  runAction: (params: GitManagerRequest) => void;
  runActionAsync: (params: GitManagerRequest) => Promise<boolean>;
}

export interface GitSelection {
  selectedCommit: CommitNode | null;
  diffSelection: DiffSelection | null;
  composingPr: boolean;
  switchTarget: string | null;
  /** The picked commit's files, but only once the host has read that commit. */
  commitDiffs: FileDiff[];
  /** The selected working-tree file, when git still calls it conflicted. */
  conflictPath: string | null;
  selectedStagingFile: { path: string; staged: boolean } | null;

  selectCommit: (commit: CommitNode) => void;
  closeCommitDetail: () => void;
  selectCommitFile: (diff: FileDiff) => void;
  selectStagingFile: (path: string, staged: boolean) => void;
  closeDiff: () => void;
  openPullRequest: () => void;
  closePullRequest: () => void;
  requestCheckout: (branch: string) => void;
  chooseSwitch: (strategy: SwitchStrategy) => Promise<void>;
  cancelSwitch: () => void;
  /** Hand the panes over to an AI run: it is about the merge, nothing else. */
  clearForRun: () => void;
}

export function useGitSelection({ state, runAction, runActionAsync }: Options): GitSelection {
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null);
  // The right pane is the diff, or the PR composer — never a fourth surface.
  const [composingPr, setComposingPr] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);

  const selectCommit = useCallback((commit: CommitNode) => {
    setSelectedCommit(commit);
    setDiffSelection(null);
    runAction({ action: 'show_commit', hash: commit.hash });
  }, [runAction]);

  // Going back to the working tree takes the commit's diff with it — leaving it
  // open would show a file from a commit that is no longer on screen.
  const closeCommitDetail = useCallback(() => {
    setSelectedCommit(null);
    setDiffSelection((current) => current?.kind === 'commitFile' ? null : current);
  }, []);

  // A file inside the selected commit — compared against that commit's parent.
  const selectCommitFile = useCallback((diff: FileDiff) => {
    if (!selectedCommit) return;
    setComposingPr(false);
    setDiffSelection({
      kind: 'commitFile',
      hash: selectedCommit.hash,
      path: diff.path,
      oldPath: diff.oldPath,
      status: diff.status,
    });
  }, [selectedCommit]);

  // A working-tree file. The diff renders from the file's own contents, so
  // there is no round trip through the extension to wait for.
  const selectStagingFile = useCallback((path: string, staged: boolean) => {
    const change = state.fileChanges.find((f) => f.path === path && f.staged === staged);
    setComposingPr(false);
    setDiffSelection({
      kind: 'working',
      path,
      oldPath: change?.oldPath,
      status: change?.status ?? 'modified',
      staged,
    });
  }, [state.fileChanges]);

  const closeDiff = useCallback(() => setDiffSelection(null), []);

  const openPullRequest = useCallback(() => {
    setComposingPr(true);
    setDiffSelection(null);
  }, []);

  const closePullRequest = useCallback(() => setComposingPr(false), []);

  // Switching branch with uncommitted changes is the one action that can
  // destroy work, so it is the one action that asks first (§7).
  const requestCheckout = useCallback((branch: string) => {
    if (state.fileChanges.length === 0) {
      runAction({ action: 'checkout', branch });
      return;
    }
    setSwitchTarget(branch);
  }, [runAction, state.fileChanges.length]);

  const chooseSwitch = useCallback(async (strategy: SwitchStrategy) => {
    const branch = switchTarget;
    setSwitchTarget(null);
    if (!branch) return;
    if (strategy === 'stash' && !(await runActionAsync({ action: 'stash' }))) return;
    await runActionAsync({
      action: 'checkout',
      branch,
      force: strategy === 'discard',
    });
  }, [runActionAsync, switchTarget]);

  const cancelSwitch = useCallback(() => setSwitchTarget(null), []);

  const clearForRun = useCallback(() => {
    setDiffSelection(null);
    setComposingPr(false);
    setSelectedCommit(null);
  }, []);

  const commitDiffs = useMemo(() => {
    if (!selectedCommit) return [];
    if (state.selectedCommitHash === selectedCommit.hash && state.commitDiffs) {
      return state.commitDiffs;
    }
    return [];
  }, [selectedCommit, state.selectedCommitHash, state.commitDiffs]);

  const conflictPath = useMemo(() => {
    if (diffSelection?.kind !== 'working') return null;
    const conflicted = state.fileChanges.some(
      (file) => file.path === diffSelection.path && file.status === 'conflict',
    );
    return conflicted ? diffSelection.path : null;
  }, [diffSelection, state.fileChanges]);

  const selectedStagingFile = useMemo(
    () => (diffSelection?.kind === 'working'
      ? { path: diffSelection.path, staged: diffSelection.staged }
      : null),
    [diffSelection],
  );

  return {
    selectedCommit,
    diffSelection,
    composingPr,
    switchTarget,
    commitDiffs,
    conflictPath,
    selectedStagingFile,
    selectCommit,
    closeCommitDetail,
    selectCommitFile,
    selectStagingFile,
    closeDiff,
    openPullRequest,
    closePullRequest,
    requestCheckout,
    chooseSwitch,
    cancelSwitch,
    clearForRun,
  };
}
