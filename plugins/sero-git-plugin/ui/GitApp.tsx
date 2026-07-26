/**
 * GitApp, Sero web UI for the Git workspace manager.
 *
 * A GitKraken-inspired interface with a visual commit graph,
 * branch panel, staging area, and diff viewer. Uses useAppState
 * from @sero-ai/app-runtime for file-backed reactive state.
 *
 * This file is composition. The behaviour behind it lives in three hooks —
 * running actions and reporting failures (`useGitActions`), what the panes are
 * showing (`useGitSelection`), and how the app is laid out (`useGitLayout`).
 */

import { memo, useCallback, useMemo } from 'react';
import { openSeroFile, useAppInfo, useAppState, useTheme } from '@sero-ai/app-runtime';

import type { GitAppState } from '../shared/types';
import { createDefaultGitState, normalizeGitState } from '../shared/types';
import { BranchPanel } from './components/BranchPanel';
import { CommitDetail } from './components/CommitDetail';
import { useConflictRun } from './store/conflict-run';
import { useAiResolution } from './store/use-ai-resolution';
import { DetailPane } from './components/app/DetailPane';
import { GraphBand } from './components/app/GraphBand';
import { GraphDivider } from './components/app/GraphDivider';
import { ModeBanner } from './components/app/ModeBanner';
import { SwitchBranchDialog } from './components/app/SwitchBranchDialog';
import { deriveRepoMode } from './lib/repo-mode';
import { WorkingTree } from './components/app/WorkingTree';
import { Header } from './components/Header';
import { computeGraphLayout } from './lib/graph-layout';
import { useGitActions } from './store/use-git-actions';
import { useGitLayout } from './store/use-git-layout';
import { useGitSelection } from './store/use-git-selection';
import { useGitHubAuth } from './store/useGitHubAuth';
import { MAX_GRAPH_HEIGHT_PCT, MIN_GRAPH_HEIGHT_PCT } from './store/ui-state';
import {
  EmptyRepoState,
  GitActionNotice,
  WorkspaceLoadingState,
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

  const github = useGitHubAuth();
  const { notice, dismissNotice, runAction, runActionAsync } = useGitActions(workspaceId);
  const selection = useGitSelection({ state, runAction, runActionAsync });
  const layout = useGitLayout(workspacePath);

  // Actions are stable store functions, so reading them here costs no renders.
  const answerQuestion = useConflictRun((run) => run.answer);
  const pauseRun = useConflictRun((run) => run.pause);
  const resumeRun = useConflictRun((run) => run.resume);
  const stopRun = useConflictRun((run) => run.stop);
  const undoAiResolutions = useConflictRun((run) => run.undoAiResolutions);

  // A new origin changes what every other control can do, so pick it up at once.
  const handlePublished = useCallback(() => {
    runAction({ action: 'refresh' });
  }, [runAction]);

  const handleOpenInEditor = useCallback((path: string) => {
    void openSeroFile(workspaceId, path);
  }, [workspaceId]);

  // Git's definition of resolved is staged, so writing the file is only half
  // of it — the other half is telling git the fight is over.
  const handleConflictResolved = useCallback((path: string) => {
    runAction({ action: 'stage', file: path });
  }, [runAction]);

  // Every log line jumps to its file, so the account doubles as a checklist.
  const selectStagingFile = selection.selectStagingFile;
  const handleSelectRunFile = useCallback((path: string) => {
    selectStagingFile(path, false);
  }, [selectStagingFile]);

  // One layout, read by both the graph and the rail, so a branch is the same
  // colour in each.
  const graphLayout = useMemo(() => computeGraphLayout(state.commits), [state.commits]);
  // The hard states, derived once: the banner, the top bar, the working tree
  // and the rail all read this rather than each working it out (§7).
  const repoMode = useMemo(() => deriveRepoMode(state), [state]);

  // The AI resolver (§7). It writes through the same seam the manual resolver
  // does — file contents, then stage — so nothing about it is a special path.
  const ai = useAiResolution({
    workspaceId,
    workspacePath,
    repoPath: state.repoPath,
    conflictPaths: repoMode.conflictPaths,
    merging: repoMode.mode === 'merging',
    onAction: runActionAsync,
  });

  // The account takes the right pane, so starting a run puts it in view. The
  // selected commit goes too: a run is about the merge, and the middle column
  // has to be the conflict list for the account beside it to mean anything.
  const clearForRun = selection.clearForRun;
  const handleResolveWithAi = useCallback(() => {
    clearForRun();
    ai.start();
  }, [ai, clearForRun]);

  /**
   * The account holds the right pane whenever nothing has been opened into it.
   *
   * Deliberately **not** conditioned on a selected commit: selecting a commit
   * clears the diff, so the right pane is idle exactly then. Guarding on it
   * meant clicking a commit before starting a run made the whole run invisible
   * — the button vanished, because the run had started, and nothing took its
   * place.
   */
  const showRunLog = ai.status !== 'idle' && !selection.diffSelection;

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
          onOpenPullRequest={selection.openPullRequest}
          info={repoMode}
        />

        {/* A mode you are in, and the way out of it (rule 24). */}
        <MemoizedModeBanner
          info={repoMode}
          {...(isNotRepo || !state.error ? {} : { error: state.error })}
          defaultBranch={state.defaultBranch}
          onAction={runAction}
          onRequestCheckout={selection.requestCheckout}
          runStatus={ai.status}
          hasAiResolutions={ai.aiResolvedPaths.length > 0}
          onResolveWithAi={handleResolveWithAi}
          onUndoAiResolutions={undoAiResolutions}
        />

        <SwitchBranchDialog
          branch={selection.switchTarget}
          currentBranch={state.currentBranch}
          changedFiles={state.fileChanges.length}
          onChoose={(strategy) => void selection.chooseSwitch(strategy)}
          onCancel={selection.cancelSwitch}
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
          /* Rail · (working tree + diff) above; history below the divider. */
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
                onRequestCheckout={selection.requestCheckout}
                sectionsOpen={layout.sectionsOpen}
                onToggleSection={layout.toggleSection}
              />

              {/* One column, two lists: the files you are changing, or the
                  files in the commit you picked out of the history. Both feed
                  the same diff on the right, so it is the same job. */}
              <div className="flex w-[300px] shrink-0 border-r border-[var(--border-default)]">
                {selection.selectedCommit ? (
                  <MemoizedCommitDetail
                    key={selection.selectedCommit.hash}
                    commit={selection.selectedCommit}
                    diffs={selection.commitDiffs}
                    loading={state.selectedCommitHash !== selection.selectedCommit.hash}
                    hasWorkingTreeChanges={state.fileChanges.length > 0}
                    selectedPath={selection.diffSelection?.kind === 'commitFile'
                      ? selection.diffSelection.path
                      : null}
                    onSelectFile={selection.selectCommitFile}
                    onClose={selection.closeCommitDetail}
                    onAction={runAction}
                  />
                ) : (
                  <MemoizedWorkingTree
                    workspaceId={workspaceId}
                    fileChanges={state.fileChanges}
                    onAction={runAction}
                    onSelectFile={selection.selectStagingFile}
                    onOpenInEditor={handleOpenInEditor}
                    selectedFile={selection.selectedStagingFile}
                    info={repoMode}
                    aiResolvedPaths={ai.aiResolvedPaths}
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <DetailPane
                  state={state}
                  workspaceId={workspaceId}
                  workspacePath={workspacePath}
                  editorThemeId={editorThemeId}
                  themeMode={themeMode}
                  github={github}
                  composingPr={selection.composingPr}
                  onClosePullRequest={selection.closePullRequest}
                  onPublished={handlePublished}
                  conflictPath={selection.conflictPath}
                  onConflictResolved={handleConflictResolved}
                  diffSelection={selection.diffSelection}
                  onCloseDiff={selection.closeDiff}
                  commitSelected={Boolean(selection.selectedCommit)}
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

            {!layout.viewState.graphCollapsed && (
              <GraphDivider
                heightPct={layout.graphHeightPct}
                onChange={layout.onDividerMove}
                onCommit={layout.onDividerCommit}
                min={MIN_GRAPH_HEIGHT_PCT}
                max={MAX_GRAPH_HEIGHT_PCT}
              />
            )}

            <div
              className="shrink-0 border-t border-[var(--border-default)]"
              style={{
                height: layout.viewState.graphCollapsed ? 'auto' : `${layout.graphHeightPct}%`,
              }}
            >
              <MemoizedGraphBand
                commits={state.commits}
                selectedHash={selection.selectedCommit?.hash}
                onSelectCommit={selection.selectCommit}
                collapsed={layout.viewState.graphCollapsed}
                onToggleCollapsed={layout.toggleGraph}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// The host's federation loader resolves exposed modules by default export.
export default GitApp;
