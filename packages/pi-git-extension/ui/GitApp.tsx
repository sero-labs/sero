/**
 * GitApp — Sero web UI for the Git workspace manager.
 *
 * A GitKraken-inspired interface with a visual commit graph,
 * branch panel, staging area, and diff viewer. Uses useAppState
 * from @sero/app-runtime for file-backed reactive state.
 *
 * Layout:
 * ┌────────────────────────────────────────────────────┐
 * │  Header: repo name, branch, push/pull/fetch        │
 * ├──────┬─────────────────────────┬───────────────────┤
 * │ Side │  Commit Graph           │  Diff Viewer      │
 * │ bar  │  (scrollable)           │  (when file       │
 * │      │                         │   selected)       │
 * ├──────┴─────────────────────────┴───────────────────┤
 * │  Commit Detail (when commit selected)              │
 * ├────────────────────────────────────────────────────┤
 * │  Staging Area (unstaged | staged | commit)         │
 * └────────────────────────────────────────────────────┘
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppState, useAgentPrompt } from '@sero/app-runtime';
import type { GitAppState, CommitNode, FileDiff } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';
import { GIT_STYLES } from './styles';
import { Header } from './components/Header';
import { BranchPanel } from './components/BranchPanel';
import { CommitGraph } from './components/CommitGraph';
import { CommitDetail } from './components/CommitDetail';
import { StagingArea } from './components/StagingArea';
import { DiffViewer } from './components/DiffViewer';

export function GitApp() {
  const [state] = useAppState<GitAppState>(DEFAULT_GIT_STATE);
  const promptAgent = useAgentPrompt();

  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [activeDiff, setActiveDiff] = useState<FileDiff | null>(null);
  const [showDiffPanel, setShowDiffPanel] = useState(false);

  const onAction = useCallback((prompt: string) => {
    promptAgent(prompt);
  }, [promptAgent]);

  const handleSelectCommit = useCallback((commit: CommitNode) => {
    setSelectedCommit(commit);
    setActiveDiff(null);
    setShowDiffPanel(false);
    // Ask the extension to load commit diffs
    promptAgent(`Using the git_manager tool: show_commit hash="${commit.hash}"`);
  }, [promptAgent]);

  const handleCloseCommitDetail = useCallback(() => {
    setSelectedCommit(null);
  }, []);

  const handleSelectDiffFile = useCallback((diff: FileDiff) => {
    setActiveDiff(diff);
    setShowDiffPanel(true);
  }, []);

  const handleSelectStagingFile = useCallback((path: string, staged: boolean) => {
    promptAgent(`Using the git_manager tool: diff file="${path}" staged=${staged}`);
  }, [promptAgent]);

  const handleCloseDiff = useCallback(() => {
    setActiveDiff(null);
    setShowDiffPanel(false);
  }, []);

  // Get commit diffs from state (populated by extension after show_commit)
  const commitDiffs = useMemo(() => {
    if (!selectedCommit) return [];
    if (state.selectedCommitHash === selectedCommit.hash && state.commitDiffs) {
      return state.commitDiffs;
    }
    return [];
  }, [selectedCommit, state.selectedCommitHash, state.commitDiffs]);

  // Get active diff from state (populated by extension after diff action)
  const viewDiff = activeDiff ?? state.activeDiff ?? null;

  const isNotRepo = state.error === 'Not a git repository';

  return (
    <>
      <style>{GIT_STYLES}</style>
      <div className="git-root relative flex h-full w-full flex-col overflow-hidden">
        <Header state={state} onAction={onAction} />

        {isNotRepo ? (
          <EmptyRepoState />
        ) : (
          <>
            {/* Main area: sidebar + graph + diff */}
            <div className="flex flex-1 overflow-hidden">
              <BranchPanel
                branches={state.branches}
                remotes={state.remotes}
                stashes={state.stashes}
                currentBranch={state.currentBranch}
                onAction={onAction}
              />

              <div className="flex flex-1 overflow-hidden">
                {/* Commit graph */}
                <CommitGraph
                  commits={state.commits}
                  selectedHash={selectedCommit?.hash}
                  onSelectCommit={handleSelectCommit}
                />

                {/* Right diff panel */}
                {showDiffPanel && viewDiff && (
                  <div className="w-[45%] shrink-0 border-l border-[var(--g-border)] overflow-y-auto git-scrollbar p-3">
                    <DiffViewer diff={viewDiff} onClose={handleCloseDiff} />
                  </div>
                )}
              </div>
            </div>

            {/* Commit detail */}
            <CommitDetail
              commit={selectedCommit}
              diffs={commitDiffs}
              onSelectFile={handleSelectDiffFile}
              onClose={handleCloseCommitDetail}
              onAction={onAction}
            />

            {/* Staging area */}
            <StagingArea
              fileChanges={state.fileChanges}
              onAction={onAction}
              onSelectFile={handleSelectStagingFile}
            />
          </>
        )}
      </div>
    </>
  );
}

// ── Empty state for non-git repos ───────────────────────────

function EmptyRepoState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center text-center max-w-xs">
        <div className="w-16 h-16 rounded-full bg-[var(--g-elevated)] flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--g-dim)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3v12a3 3 0 003 3h0a3 3 0 003-3V9" />
            <circle cx="9" cy="3" r="2" />
            <circle cx="15" cy="9" r="2" />
            <circle cx="12" cy="21" r="2" />
          </svg>
        </div>
        <h2 className="text-base font-medium text-[var(--g-text)]">Not a Git repository</h2>
        <p className="mt-2 text-sm text-[var(--g-muted)] leading-relaxed">
          Open a workspace with a Git repository to use the Git manager.
        </p>
      </div>
    </div>
  );
}

export default GitApp;
