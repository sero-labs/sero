/**
 * GitApp, Sero web UI for the Git workspace manager.
 *
 * A GitKraken-inspired interface with a visual commit graph,
 * branch panel, staging area, and diff viewer. Uses useAppState
 * from @sero-ai/app-runtime for file-backed reactive state.
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { getSeroApi, openSeroFile, useAppInfo, useAppState } from '@sero-ai/app-runtime';

import type { GitActionResult } from '@sero-ai/common';
import type { CommitNode, FileDiff, GitAppState, GitManagerRequest } from '../shared/types';
import { createDefaultGitState, normalizeGitState } from '../shared/types';
import { BranchPanel } from './components/BranchPanel';
import { CommitDetail } from './components/CommitDetail';
import { DiffPane, type DiffSelection } from './components/diff/DiffPane';
import { GraphBand } from './components/app/GraphBand';
import { GraphDivider } from './components/app/GraphDivider';
import { WorkingTree } from './components/app/WorkingTree';
import { Header } from './components/Header';
import {
  MAX_GRAPH_HEIGHT_PCT,
  MIN_GRAPH_HEIGHT_PCT,
  useGitViewState,
} from './store/ui-state';
import {
  DiffPaneHeader,
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

export function GitApp() {
  const initialState = useMemo(() => createDefaultGitState(), []);
  const [rawState] = useAppState<GitAppState>(initialState);
  const state = useMemo(() => normalizeGitState(rawState), [rawState]);
  const { workspaceId, workspacePath } = useAppInfo();

  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null);
  const [viewState, setViewState] = useGitViewState(workspacePath);
  const [graphHeightPct, setGraphHeightPct] = useState<number | null>(null);
  const [graphCollapsed, setGraphCollapsed] = useState(false);
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

  const runAction = useCallback((params: GitManagerRequest) => {
    const gitApp = getSeroApi().gitApp;
    if (!gitApp) {
      console.warn('[git-app] gitApp bridge unavailable');
      showNotice('Git bridge unavailable', 'Reload Sero or reopen this workspace to restore Git actions.');
      return;
    }

    void gitApp.run(workspaceId, params).then((actionResult: GitActionResult) => {
      if (!actionResult.ok) {
        console.error('[git-app] Action failed:', actionResult.message);
        showNotice(getActionFailureTitle(params.action), actionResult.message);
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[git-app] Action failed:', error);
      showNotice(getActionFailureTitle(params.action), message);
    });
  }, [showNotice, workspaceId]);

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

  const commitDiffs = useMemo(() => {
    if (!selectedCommit) return [];
    if (state.selectedCommitHash === selectedCommit.hash && state.commitDiffs) {
      return state.commitDiffs;
    }
    return [];
  }, [selectedCommit, state.selectedCommitHash, state.commitDiffs]);

  const selectedStagingFile = useMemo(
    () => (diffSelection?.kind === 'working'
      ? { path: diffSelection.path, staged: diffSelection.staged }
      : null),
    [diffSelection],
  );
  const effectiveGraphHeight = graphHeightPct ?? viewState.graphHeightPct;
  const conflicts = state.fileChanges.filter((file) => file.status === 'conflict').length;
  const commitBlockedReason = conflicts > 0
    ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} left to resolve`
    : null;
  const isWorkspaceStateCurrent = state.repoPath === workspacePath;
  const showWorkspaceLoading = Boolean(workspacePath) && !isWorkspaceStateCurrent && !state.error;
  const isNotRepo = state.error === 'Not a git repository' && isWorkspaceStateCurrent;

  return (
    <>
      <style>{GIT_STYLES}</style>
      <div className="git-root relative flex size-full flex-col overflow-hidden">
        <MemoizedHeader state={state} onAction={runAction} />

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
                />

                <div className="flex w-[300px] shrink-0 border-r border-[var(--border-default)]">
                  <MemoizedWorkingTree
                    fileChanges={state.fileChanges}
                    onAction={runAction}
                    onSelectFile={handleSelectStagingFile}
                    onOpenInEditor={handleOpenInEditor}
                    selectedFile={selectedStagingFile}
                    commitBlockedReason={commitBlockedReason}
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  {diffSelection ? (
                    <>
                      <DiffPaneHeader selection={diffSelection} onClose={handleCloseDiff} />
                      <div className="min-h-0 flex-1">
                        <DiffPane
                          workspaceId={workspaceId}
                          repoPath={state.repoPath}
                          selection={diffSelection}
                          diffStyle="unified"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <p className="max-w-xs text-xs text-[var(--text-muted)]">
                        Pick a file or a commit to see what changed.
                      </p>
                    </div>
                  )}
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
