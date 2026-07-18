/**
 * Agent Board types — persisted preferences and the per-workspace state slices
 * the board store aggregates (docs/features/agent-board/plan.md).
 */

import type {
  AppRuntimeIssueSummary,
  AppRuntimePullRequestSummary,
  OrchestratorBoardIndexView,
} from '@sero-ai/common';

export type BoardColumnId = 'backlog' | 'active' | 'attention' | 'done';

/** Board preferences persisted via layout.json (never localStorage). */
export interface BoardLayoutState {
  collapsedColumns?: BoardColumnId[];
  /** Workspace id to filter to; absent/null = all workspaces. */
  workspaceFilter?: string | null;
}

/**
 * The slice of the git app's watched state file the board reads
 * (`.sero/apps/git/state.json`, written by the git plugin's extension).
 * Structural subset — the plugin owns the full shape.
 */
export interface BoardGitState {
  repoName?: string;
  currentBranch?: string;
  headHash?: string;
  branches?: {
    name: string;
    current: boolean;
    ahead: number;
    behind: number;
  }[];
  fileChanges?: { path: string }[];
}

/** Everything the board aggregates for one workspace (all push/watched or on-demand). */
export interface WorkspaceBoardSlice {
  /** Watched orchestrator loop index (null until first read / when absent). */
  index: OrchestratorBoardIndexView | null;
  /** Watched git app state (null when the workspace has no git state file). */
  git: BoardGitState | null;
  /** Open GitHub issues (fetched on mount/refresh, fail-soft []). */
  issues: AppRuntimeIssueSummary[];
  /** Open GitHub PRs — powers the unclaimed-issue filter and issue↔loop links. */
  openPrs: AppRuntimePullRequestSummary[];
}
