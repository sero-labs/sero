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

/** Everything the board aggregates for one workspace (all push/watched or on-demand). */
export interface WorkspaceBoardSlice {
  /** Watched orchestrator loop index (null until first read / when absent). */
  index: OrchestratorBoardIndexView | null;
  /** Open GitHub issues (fetched on mount/refresh, fail-soft []). */
  issues: AppRuntimeIssueSummary[];
  /** Open GitHub PRs — powers the unclaimed-issue filter and issue↔loop links. */
  openPrs: AppRuntimePullRequestSummary[];
}
