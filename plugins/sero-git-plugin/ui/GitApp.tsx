/**
 * GitApp, Sero web UI for the Git workspace manager.
 *
 * A GitKraken-inspired interface with a visual commit graph,
 * branch panel, staging area, and diff viewer. Uses useAppState
 * from @sero-ai/app-runtime for file-backed reactive state.
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { getSeroApi, openSeroFile, useAppInfo, useAppState, useTheme } from '@sero-ai/app-runtime';

import type { GitActionResult } from '@sero-ai/common';
import type { CommitNode, FileDiff, GitAppState, GitManagerRequest } from '../shared/types';
import { createDefaultGitState, normalizeGitState } from '../shared/types';
import { BranchPanel } from './components/BranchPanel';
import { CommitDetail } from './components/CommitDetail';
import { useConflictRun } from './store/conflict-run';
import { useAiResolution } from './store/use-ai-resolution';
import { DetailPane } from './components/app/DetailPane';
import { type DiffSelection } from './components/diff/DiffPane';
import { GraphBand } from './components/app/GraphBand';
import { GraphDivider } from './components/app/GraphDivider';
import { ModeBanner } from './components/app/ModeBanner';
import { SwitchBranchDialog, type SwitchStrategy } from './components/app/SwitchBranchDialog';
import { deriveRepoMode } from './lib/repo-mode';
import { WorkingTree } from './components/app/WorkingTree';
import { Header } from './components/Header';
import { computeGraphLayout } from './lib/graph-layout';
import { useGitHubAuth } from './store/useGitHubAuth';
import {
  MAX_GRAPH_HEIGHT_PCT,
  MIN_GRAPH_HEIGHT_PCT,
  useGitViewState,
} from './store/ui-state';
import {
  EmptyRepoState,
  getActionFailureTitle,
  GitActionNotice,
  WorkspaceLoadingState,
  type GitActionNoticeState,
} from './components/app/GitAppChrome';
import { GIT_STYLES } from './styles';

// Git state refreshes and transient app UI (notices, open diffs, selections)
// update independently. Keep the large, otherwise unchanged renderer sections
// out of those unrelated commits.
const MemoizedHeader = memo(Header);
const MemoizedBranchPanel = memo(BranchPanel);
const MemoizedGraphBand = memo(GraphBand);
const MemoizedCommitDetail = memo(CommitDetail);
const MemoizedWorkingTree = memo(WorkingTree);
const MemoizedModeBanner = memo(ModeBanner);

export function GitApp() {
  const initialState = useMemo(() => createDefaultGitState(), []);
  const [rawState] = useAppState<GitAppState>(initialState);
  const state = useMemo(() => normalizeGitState(rawState), [rawState]);
  const { workspaceId, workspacePath } = useAppInfo();
  const { mode: themeMode, editorThemeId } = useTheme();

  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null);
  const [viewState, setViewState] = useGitViewState(workspacePath);
  const [graphHeightPct, setGraphHeightPct] = useState<number | null>(null);
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  // The right pane is the diff, or the PR composer — never a fourth surface.
  const [composingPr, setComposingPr] = useState(false);
  /** The branch a dirty working tree is being asked to switch to. */
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const github = useGitHubAuth();
  // Actions are stable store functions, so reading them here costs no renders.
  const answerQuestion = useConflictRun((run) => run.answer);
  const pauseRun = useConflictRun((run) => run.pause);
  const resumeRun = useConflictRun((run) => run.resume);
  const stopRun = useConflictRun((run) => run.stop);
  const undoAiResolutions = useConflictRun((run) => run.undoAiResolutions);
  // Read straight from the store: the repo mode needs it, and the resolution
  // hook is built *from* the repo mode.
  const unresolvedPaths = useConflictRun((run) => run.unresolvedPaths);
  const [notice, setNotice] = useState<GitActionNoticeState | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissNotice = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(null);
  }, []);

  const showNotice = useCallback((title: string, message: string) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }

    const nextNotice: GitActionNoticeState = {
      id: Date.now(),
      title,
      message,
    };
    setNotice(nextNotice);
    noticeTimerRef.current = setTimeout(() => {
      setNotice((current) => current?.id === nextNotice.id ? null : current);
      noticeTimerRef.current = null;
    }, 5000);
  }, []);

  // Resolves false when the action failed, so callers that must sequence —
  // stash *then* switch — can stop rather than carry on into a broken state.
  const runActionAsync = useCallback(async (params: GitManagerRequest): Promise<boolean> => {
    const gitApp = getSeroApi().gitApp;
    if (!gitApp) {
      console.warn('[git-app] gitApp bridge unavailable');
      showNotice('Git bridge unavailable', 'Reload Sero or reopen this workspace to restore Git actions.');
      return false;
    }

    try {
      const actionResult: GitActionResult = await gitApp.run(workspaceId, params);
      if (!actionResult.ok) {
        console.error('[git-app] Action failed:', actionResult.message);
        showNotice(getActionFailureTitle(params.action), actionResult.message);
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[git-app] Action failed:', error);
      showNotice(getActionFailureTitle(params.action), message);
      return false;
    }
  }, [showNotice, workspaceId]);

  const runAction = useCallback((params: GitManagerRequest) => {
    void runActionAsync(params);
  }, [runActionAsync]);

  // Switching branch with uncommitted changes is the one action that can
  // destroy work, so it is the one action that asks first (§7).
  const handleRequestCheckout = useCallback((branch: string) => {
    if (state.fileChanges.length === 0) {
      runAction({ action: 'checkout', branch });
      return;
    }
    setSwitchTarget(branch);
  }, [runAction, state.fileChanges.length]);

  const handleSwitchChoice = useCallback(async (strategy: SwitchStrategy) => {
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

  const handleSelectCommit = useCallback((commit: CommitNode) => {
    setSelectedCommit(commit);
    setDiffSelection(null);
    runAction({ action: 'show_commit', hash: commit.hash });
  }, [runAction]);

  const handleCloseCommitDetail = useCallback(() => {
    setSelectedCommit(null);
  }, []);

  // A file inside the selected commit — compared against that commit's parent.
  const handleSelectDiffFile = useCallback((diff: FileDiff) => {
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
  const handleSelectStagingFile = useCallback((path: string, staged: boolean) => {
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

  const handleCloseDiff = useCallback(() => {
    setDiffSelection(null);
  }, []);

  const handleOpenPullRequest = useCallback(() => {
    setComposingPr(true);
    setDiffSelection(null);
  }, []);

  const handleClosePullRequest = useCallback(() => setComposingPr(false), []);

  // A new origin changes what every other control can do, so pick it up at once.
  const handlePublished = useCallback(() => {
    runAction({ action: 'refresh' });
  }, [runAction]);

  const handleOpenInEditor = useCallback((path: string) => {
    void openSeroFile(workspaceId, path);
  }, [workspaceId]);

  // Stable so the graph band stays memoised — an inline arrow here re-renders
  // the whole history on every unrelated state change.
  const handleToggleGraph = useCallback(() => setGraphCollapsed((value) => !value), []);

  // Dragging updates locally on every move and persists once, on release.
  const handleDividerMove = useCallback((pct: number) => setGraphHeightPct(pct), []);
  const handleDividerCommit = useCallback((pct: number) => {
    setGraphHeightPct(null);
    setViewState({ graphHeightPct: pct });
  }, [setViewState]);

  // The AI marks live in the same per-workspace view state as the divider, so
  // they survive a reload in the middle of a merge.
  const aiResolvedStore = useMemo(() => ({
    stored: viewState.aiResolved,
    save: (next: { mergeRef: string; paths: string[] } | undefined) => {
      setViewState({ aiResolved: next });
    },
  }), [setViewState, viewState.aiResolved]);

  const commitDiffs = useMemo(() => {
    if (!selectedCommit) return [];
    if (state.selectedCommitHash === selectedCommit.hash && state.commitDiffs) {
      return state.commitDiffs;
    }
    return [];
  }, [selectedCommit, state.selectedCommitHash, state.commitDiffs]);

  // The selected working-tree file, when it is one git still calls conflicted.
  const conflictPath = useMemo(() => {
    if (diffSelection?.kind !== 'working') return null;
    const conflicted = state.fileChanges.some(
      (file) => file.path === diffSelection.path && file.status === 'conflict',
    );
    return conflicted ? diffSelection.path : null;
  }, [diffSelection, state.fileChanges]);

  // Git's definition of resolved is staged, so writing the file is only half
  // of it — the other half is telling git the fight is over.
  const handleConflictResolved = useCallback((path: string) => {
    runAction({ action: 'stage', file: path });
  }, [runAction]);

  // Every log line jumps to its file, so the account doubles as a checklist.
  const handleSelectRunFile = useCallback((path: string) => {
    handleSelectStagingFile(path, false);
  }, [handleSelectStagingFile]);

  const selectedStagingFile = useMemo(
    () => (diffSelection?.kind === 'working'
      ? { path: diffSelection.path, staged: diffSelection.staged }
      : null),
    [diffSelection],
  );
  // One layout, read by both the graph and the rail, so a branch is the same
  // colour in each.
  const graphLayout = useMemo(() => computeGraphLayout(state.commits), [state.commits]);
  const effectiveGraphHeight = graphHeightPct ?? viewState.graphHeightPct;
  // The hard states, derived once: the banner, the top bar, the working tree
  // and the rail all read this rather than each working it out (§7).
  // Empty until an undo, so the mode is unaffected in every other case.
  const repoMode = useMemo(
    () => deriveRepoMode(state, unresolvedPaths),
    [state, unresolvedPaths],
  );

  // The AI resolver (§7). It writes through the same seam the manual resolver
  // does — file contents, then stage — so nothing about it is a special path.
  const ai = useAiResolution({
    workspaceId,
    workspacePath,
    repoPath: state.repoPath,
    conflictPaths: repoMode.conflictPaths,
    merging: repoMode.mode === 'merging',
    mergeRef: repoMode.mergeFrom,
    onAction: runActionAsync,
    aiResolvedStore,
  });

  // The account takes the right pane, so starting a run puts it in view.
  const handleResolveWithAi = useCallback(() => {
    setDiffSelection(null);
    setComposingPr(false);
    ai.start();
  }, [ai]);

  // It holds the pane while there is one and nothing else was asked for.
  const showRunLog = ai.status !== 'idle' && !diffSelection && !selectedCommit;

  const isWorkspaceStateCurrent = state.repoPath === workspacePath;
  const showWorkspaceLoading = Boolean(workspacePath) && !isWorkspaceStateCurrent && !state.error;
  const isNotRepo = state.error === 'Not a git repository' && isWorkspaceStateCurrent;

  return (
    <>
      <style>{GIT_STYLES}</style>
      <div className="git-root relative flex size-full flex-col overflow-hidden">
        <MemoizedHeader
          state={state}
          onAction={runAction}
          github={github}
          onOpenPullRequest={handleOpenPullRequest}
          info={repoMode}
        />

        {/* A mode you are in, and the way out of it (rule 24). */}
        <MemoizedModeBanner
          info={repoMode}
          defaultBranch={state.defaultBranch}
          onAction={runAction}
          onRequestCheckout={handleRequestCheckout}
          runStatus={ai.status}
          hasAiResolutions={ai.aiResolvedPaths.length > 0}
          onResolveWithAi={handleResolveWithAi}
          onUndoAiResolutions={undoAiResolutions}
        />

        <SwitchBranchDialog
          branch={switchTarget}
          currentBranch={state.currentBranch}
          changedFiles={state.fileChanges.length}
          onChoose={(strategy) => void handleSwitchChoice(strategy)}
          onCancel={() => setSwitchTarget(null)}
        />

        {notice && (
          <div className="pointer-events-none absolute right-4 top-14 z-30 flex w-[min(30rem,calc(100%-2rem))] justify-end">
            <GitActionNotice notice={notice} onClose={dismissNotice} />
          </div>
        )}

        {showWorkspaceLoading ? (
          <WorkspaceLoadingState workspacePath={workspacePath} />
        ) : isNotRepo ? (
          <EmptyRepoState workspacePath={workspacePath} />
        ) : (
          <>
            {/* Rail · (working tree + diff) above; history below the divider. */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1">
                <MemoizedBranchPanel
                  branches={state.branches}
                  remoteBranches={state.remoteBranches}
                  remotes={state.remotes}
                  stashes={state.stashes}
                  currentBranch={state.currentBranch}
                  defaultBranch={state.defaultBranch}
                  onAction={runAction}
                  branchColours={graphLayout.branchColours}
                  mode={repoMode.mode}
                  headHash={state.headHash}
                  onRequestCheckout={handleRequestCheckout}
                />

                <div className="flex w-[300px] shrink-0 border-r border-[var(--border-default)]">
                  <MemoizedWorkingTree
                    workspaceId={workspaceId}
                    fileChanges={state.fileChanges}
                    onAction={runAction}
                    onSelectFile={handleSelectStagingFile}
                    onOpenInEditor={handleOpenInEditor}
                    selectedFile={selectedStagingFile}
                    info={repoMode}
                    aiResolvedPaths={ai.aiResolvedPaths}
                    unresolvedPaths={unresolvedPaths}
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <DetailPane
                    state={state}
                    workspaceId={workspaceId}
                    workspacePath={workspacePath}
                    editorThemeId={editorThemeId}
                    themeMode={themeMode}
                    github={github}
                    composingPr={composingPr}
                    onClosePullRequest={handleClosePullRequest}
                    onPublished={handlePublished}
                    conflictPath={conflictPath}
                    onConflictResolved={handleConflictResolved}
                    diffSelection={diffSelection}
                    onCloseDiff={handleCloseDiff}
                    showRunLog={showRunLog}
                    runStatus={ai.status}
                    runEntries={ai.entries}
                    onAnswer={answerQuestion}
                    onPause={pauseRun}
                    onResume={resumeRun}
                    onStop={stopRun}
                    onSelectRunFile={handleSelectRunFile}
                  />
                </div>
              </div>

              {!graphCollapsed && (
                <GraphDivider
                  heightPct={effectiveGraphHeight}
                  onChange={handleDividerMove}
                  onCommit={handleDividerCommit}
                  min={MIN_GRAPH_HEIGHT_PCT}
                  max={MAX_GRAPH_HEIGHT_PCT}
                />
              )}

              <div
                className="shrink-0 border-t border-[var(--border-default)]"
                style={{ height: graphCollapsed ? 'auto' : `${effectiveGraphHeight}%` }}
              >
                <MemoizedGraphBand
                  commits={state.commits}
                  selectedHash={selectedCommit?.hash}
                  onSelectCommit={handleSelectCommit}
                  collapsed={graphCollapsed}
                  onToggleCollapsed={handleToggleGraph}
                />
              </div>
            </div>

            <MemoizedCommitDetail
              key={selectedCommit?.hash ?? 'none'}
              commit={selectedCommit}
              diffs={commitDiffs}
              hasWorkingTreeChanges={state.fileChanges.length > 0}
              onSelectFile={handleSelectDiffFile}
              onClose={handleCloseCommitDetail}
              onAction={runAction}
            />
          </>
        )}
      </div>
    </>
  );
}

// The host's federation loader resolves exposed modules by default export.
export default GitApp;
