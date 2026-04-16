/**
 * Kanban types — local barrel over the canonical shared contract.
 *
 * The source of truth now lives in `@sero/common` so the host and plugin
 * consume the same state model and validation helpers.
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
