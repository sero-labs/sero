/**
 * GitApp — Sero web UI for the Git workspace manager.
 *
 * A GitKraken-inspired interface with a visual commit graph,
 * branch panel, staging area, and diff viewer. Uses useAppState
 * from @sero/app-runtime for file-backed reactive state.
 */

import { useCallback, useMemo, useState } from 'react';
import { getSeroApi, useAppInfo, useAppState } from '@sero/app-runtime';

import type { CommitNode, FileDiff, GitAppState, GitManagerRequest } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';
import { BranchPanel } from './components/BranchPanel';
import { CommitDetail } from './components/CommitDetail';
import { CommitGraph } from './components/CommitGraph';
import { DiffViewer } from './components/DiffViewer';
import { Header } from './components/Header';
import { StagingArea } from './components/StagingArea';
import { GIT_STYLES } from './styles';

interface PendingDiffRequest {
  path: string;
  staged: boolean;
  refreshSnapshot: string;
}

export function GitApp() {
  const [state] = useAppState<GitAppState>(DEFAULT_GIT_STATE);
  const { workspaceId, workspacePath } = useAppInfo();

  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [activeDiff, setActiveDiff] = useState<FileDiff | null>(null);
  const [pendingDiffRequest, setPendingDiffRequest] = useState<PendingDiffRequest | null>(null);
  const [showDiffPanel, setShowDiffPanel] = useState(false);

  const runAction = useCallback((params: GitManagerRequest) => {
    const gitApp = getSeroApi().gitApp;
    if (!gitApp) {
      console.warn('[git-app] gitApp bridge unavailable');
      return;
    }

    void gitApp.run(workspaceId, params).then((result) => {
      if (!result.ok) {
        console.error('[git-app] Action failed:', result.message);
      }
    }).catch((error) => {
      console.error('[git-app] Action failed:', error);
    });
  }, [workspaceId]);

  const handleSelectCommit = useCallback((commit: CommitNode) => {
    setSelectedCommit(commit);
    setActiveDiff(null);
    setPendingDiffRequest(null);
    setShowDiffPanel(false);
    runAction({ action: 'show_commit', hash: commit.hash });
  }, [runAction]);

  const handleCloseCommitDetail = useCallback(() => {
    setSelectedCommit(null);
  }, []);

  const handleSelectDiffFile = useCallback((diff: FileDiff) => {
    setActiveDiff(diff);
    setPendingDiffRequest(null);
    setShowDiffPanel(true);
  }, []);

  const handleSelectStagingFile = useCallback((path: string, staged: boolean) => {
    setActiveDiff(null);
    setPendingDiffRequest({
      path,
      staged,
      refreshSnapshot: state.lastRefresh,
    });
    setShowDiffPanel(true);
    runAction({ action: 'diff', file: path, staged });
  }, [runAction, state.lastRefresh]);

  const handleCloseDiff = useCallback(() => {
    setActiveDiff(null);
    setPendingDiffRequest(null);
    setShowDiffPanel(false);
  }, []);

  const commitDiffs = useMemo(() => {
    if (!selectedCommit) return [];
    if (state.selectedCommitHash === selectedCommit.hash && state.commitDiffs) {
      return state.commitDiffs;
    }
    return [];
  }, [selectedCommit, state.selectedCommitHash, state.commitDiffs]);

  const requestedStateDiff = useMemo(() => {
    if (!pendingDiffRequest || !state.activeDiff) return null;
    if (state.activeDiff.path !== pendingDiffRequest.path) return null;
    if ((state.activeDiff.staged ?? false) !== pendingDiffRequest.staged) return null;
    return state.activeDiff;
  }, [pendingDiffRequest, state.activeDiff]);

  const diffRequestResolved = useMemo(() => {
    if (!pendingDiffRequest) return false;
    return state.lastRefresh !== pendingDiffRequest.refreshSnapshot;
  }, [pendingDiffRequest, state.lastRefresh]);

  const viewDiff = activeDiff ?? requestedStateDiff ?? null;
  const isWorkspaceStateCurrent = state.repoPath === workspacePath;
  const showWorkspaceLoading = Boolean(workspacePath) && !isWorkspaceStateCurrent && !state.error;
  const isNotRepo = state.error === 'Not a git repository' && isWorkspaceStateCurrent;

  return (
    <>
      <style>{GIT_STYLES}</style>
      <div className="git-root relative flex h-full w-full flex-col overflow-hidden">
        <Header state={state} onAction={runAction} />

        {showWorkspaceLoading ? (
          <WorkspaceLoadingState workspacePath={workspacePath} />
        ) : isNotRepo ? (
          <EmptyRepoState workspacePath={workspacePath} />
        ) : (
          <>
            <div className="flex flex-1 overflow-hidden">
              <BranchPanel
                branches={state.branches}
                remotes={state.remotes}
                stashes={state.stashes}
                currentBranch={state.currentBranch}
                onAction={runAction}
              />

              <div className="flex flex-1 overflow-hidden">
                <CommitGraph
                  commits={state.commits}
                  selectedHash={selectedCommit?.hash}
                  onSelectCommit={handleSelectCommit}
                />

                {showDiffPanel && (
                  <div className="w-[45%] shrink-0 overflow-y-auto border-l border-[var(--g-border)] p-3 git-scrollbar">
                    {viewDiff ? (
                      <DiffViewer diff={viewDiff} onClose={handleCloseDiff} />
                    ) : (
                      <DiffPlaceholder onClose={handleCloseDiff} resolved={diffRequestResolved} />
                    )}
                  </div>
                )}
              </div>
            </div>

            <CommitDetail
              commit={selectedCommit}
              diffs={commitDiffs}
              onSelectFile={handleSelectDiffFile}
              onClose={handleCloseCommitDetail}
              onAction={runAction}
            />

            <StagingArea
              fileChanges={state.fileChanges}
              onAction={runAction}
              onSelectFile={handleSelectStagingFile}
            />
          </>
        )}
      </div>
    </>
  );
}

function DiffPlaceholder({
  onClose,
  resolved,
}: {
  onClose: () => void;
  resolved: boolean;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--g-border)] bg-[var(--g-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--g-border)] bg-[var(--g-surface)] px-3 py-2">
        <span className="text-xs text-[var(--g-muted)]">
          {resolved ? 'No diff available' : 'Loading diff…'}
        </span>
        <button
          onClick={onClose}
          className="cursor-pointer p-1 text-[var(--g-dim)] transition-colors hover:text-[var(--g-text)]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-[var(--g-dim)]">
        {resolved
          ? 'This file does not have a displayable diff in the selected state.'
          : 'Preparing the diff for this file…'}
      </div>
    </div>
  );
}

function WorkspaceLoadingState({ workspacePath }: { workspacePath: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="git-loading mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--g-elevated)] text-[var(--g-accent)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3v12a3 3 0 003 3h0a3 3 0 003-3V9" />
            <circle cx="9" cy="3" r="2" />
            <circle cx="15" cy="9" r="2" />
            <circle cx="12" cy="21" r="2" />
          </svg>
        </div>
        <h2 className="text-base font-medium text-[var(--g-text)]">Loading repository</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--g-muted)]">
          Syncing Git state for <span className="git-mono text-[var(--g-text)]">{workspacePath}</span>.
        </p>
      </div>
    </div>
  );
}

function EmptyRepoState({ workspacePath }: { workspacePath: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--g-elevated)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--g-dim)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3v12a3 3 0 003 3h0a3 3 0 003-3V9" />
            <circle cx="9" cy="3" r="2" />
            <circle cx="15" cy="9" r="2" />
            <circle cx="12" cy="21" r="2" />
          </svg>
        </div>
        <h2 className="text-base font-medium text-[var(--g-text)]">Not a Git repository</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--g-muted)]">
          <span className="git-mono text-[var(--g-text)]">{workspacePath}</span> does not contain a Git repository.
        </p>
      </div>
    </div>
  );
}

export default GitApp;
