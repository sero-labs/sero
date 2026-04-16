/**
 * Shared Kanban plugin types.
 *
 * The host↔plugin board contract now lives in `@sero/common`; this file keeps
 * plugin-local imports stable and adds the plugin-specific error-log types.
 */

export type {
  Column,
  Priority,
  CardStatus,
  ReviewMode,
  Subtask,
  PlanningToolEntry,
  PlanningProgress,
  ImplementationProgress,
  ReviewProgress,
  Card,
  KanbanSettings,
  KanbanState,
} from '@sero/common';

export {
  COLUMNS,
  COLUMN_LABELS,
  PRIORITY_ORDER,
  DEFAULT_KANBAN_STATE,
  createDefaultKanbanState,
  createCard,
} from '@sero/common';

// ── Error reporting ─────────────────────────────────────────

export type ErrorSeverity = 'error' | 'warning' | 'test-failure';

export interface ErrorReport {
  /** Unique error ID */
  id: string;
  /** Card ID this error relates to */
  cardId: string;
  /** Card title at the time of the error */
  cardTitle: string;
  /** Which phase the error occurred in */
  phase: 'planning' | 'implementation' | 'review';
  /** Name of the subagent that reported the error */
  agentName: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Short summary of the error */
  message: string;
  /** Full error details (stack traces, test output, etc.) */
  details?: string;
  /** File paths involved, if any */
  filePaths?: string[];
  /** ISO timestamp */
  timestamp: string;
}

export interface ErrorLog {
  errors: ErrorReport[];
  /** ISO timestamp of last retrospective run */
  lastRetrospectiveAt?: string;
}

export const DEFAULT_ERROR_LOG: ErrorLog = {
  errors: [],
};
