/**
 * GitApp — Sero web UI for the Git workspace manager.
 *
 * A GitKraken-inspired interface with a visual commit graph,
 * branch panel, staging area, and diff viewer. Uses useAppState
 * from @sero-ai/app-runtime for file-backed reactive state.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { getSeroApi, useAppInfo, useAppState } from '@sero-ai/app-runtime';

import type { GitActionResult } from '@sero-ai/common';
import type { CommitNode, FileDiff, GitAppState, GitManagerRequest } from '../shared/types';
import { createDefaultGitState, normalizeGitState } from '../shared/types';
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

interface GitActionNoticeState {
  id: number;
  title: string;
  message: string;
}

export function GitApp() {
  const initialState = useMemo(() => createDefaultGitState(), []);
  const [rawState] = useAppState<GitAppState>(initialState);
  const state = useMemo(() => normalizeGitState(rawState), [rawState]);
  const { workspaceId, workspacePath } = useAppInfo();

  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [activeDiff, setActiveDiff] = useState<FileDiff | null>(null);
  const [pendingDiffRequest, setPendingDiffRequest] = useState<PendingDiffRequest | null>(null);
  const [showDiffPanel, setShowDiffPanel] = useState(false);
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
            <div className="flex flex-1 overflow-hidden">
              <BranchPanel
                branches={state.branches}
                remoteBranches={state.remoteBranches}
                remotes={state.remotes}
                stashes={state.stashes}
                currentBranch={state.currentBranch}
                defaultBranch={state.defaultBranch}
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
              key={selectedCommit?.hash ?? 'none'}
              commit={selectedCommit}
              diffs={commitDiffs}
              hasWorkingTreeChanges={state.fileChanges.length > 0}
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
        <button type="button"
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

function GitActionNotice({
  notice,
  onClose,
}: {
  notice: GitActionNoticeState;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto w-full rounded-lg border border-[var(--g-red)]/30 bg-[var(--g-surface)] shadow-2xl shadow-black/30 backdrop-blur-sm">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 shrink-0 rounded-full bg-[var(--g-red)]/12 p-1 text-[var(--g-red)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 3.2v3.2" />
            <path d="M6 8.8h.01" />
            <circle cx="6" cy="6" r="4.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[var(--g-text)]">{notice.title}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--g-muted)]">
            {notice.message}
          </div>
        </div>
        <button type="button"
          onClick={onClose}
          className="shrink-0 p-1 text-[var(--g-dim)] transition-colors hover:text-[var(--g-text)]"
          aria-label="Dismiss git action notice"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
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

function getActionFailureTitle(action: GitManagerRequest['action']): string {
  switch (action) {
    case 'checkout':
      return 'Could not switch branch';
    case 'create_branch':
      return 'Could not create branch';
    case 'delete_branch':
      return 'Could not delete branch';
    case 'remove_worktree':
      return 'Could not remove worktree';
    case 'stage':
      return 'Could not stage changes';
    case 'unstage':
      return 'Could not unstage changes';
    case 'commit':
      return 'Could not create commit';
    case 'push':
      return 'Could not push changes';
    case 'pull':
      return 'Could not pull changes';
    case 'fetch':
      return 'Could not fetch remotes';
    case 'stash':
    case 'stash_pop':
    case 'stash_apply':
      return 'Could not update stashes';
    case 'cherry_pick':
      return 'Could not cherry-pick commit';
    case 'merge':
      return 'Could not merge branch';
    case 'diff':
      return 'Could not load diff';
    case 'show_commit':
      return 'Could not load commit details';
    default:
      return 'Git action failed';
  }
}

export default GitApp;
