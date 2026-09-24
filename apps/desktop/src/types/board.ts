/**
 * Agent Board types - persisted preferences and the per-workspace state slices
 * the board store aggregates.
 */

import type {
  AppRuntimeIssueSummary,
  AppRuntimePullRequestSummary,
  OrchestratorBoardIndexView,
  OrchestratorBoardRoomIndexView,
} from '@sero-ai/common';

export type BoardColumnId = 'backlog' | 'active' | 'attention' | 'done';

/** A board-only record. It never owns or deletes the source item. */
export interface BoardArchiveEntry {
  key: string;
  kind: 'loop' | 'room' | 'issue' | 'session';
  title: string;
  workspaceId: string;
  workspaceName: string;
  archivedAt: string;
}

/** Board state persisted via layout.json (never localStorage). */
export interface BoardLayoutState {
  collapsedColumns?: BoardColumnId[];
  /** Workspace id to filter to; absent/null = all workspaces. */
  workspaceFilter?: string | null;
  archived?: BoardArchiveEntry[];
  /** Permanent board suppression, including cards that later reappear in source data. */
  deletedKeys?: string[];
  /** Restored cards remain visible past the usual Finished cap; stopped sessions appear there. */
  restoredKeys?: string[];
}

/** Everything the board aggregates for one workspace (all push/watched or on-demand). */
export interface WorkspaceBoardSlice {
  /** Watched orchestrator loop index (null until first read / when absent). */
  index: OrchestratorBoardIndexView | null;
  /**
   * Watched Room index. Null in a workspace where Room mode has never run —
   * the file only exists once a Room does.
   */
  rooms: OrchestratorBoardRoomIndexView | null;
  /** Open GitHub issues (fetched on mount/refresh, fail-soft []). */
  issues: AppRuntimeIssueSummary[];
  /** Open GitHub PRs — powers the unclaimed-issue filter and issue↔loop links. */
  openPrs: AppRuntimePullRequestSummary[];
}
