/**
 * Kanban types — re-export from the shared package.
 *
 * Single source of truth is packages/pi-kanban-extension/shared/types.ts.
 * This barrel re-exports everything so electron/kanban/ modules can use
 * short `./types` imports while sharing types with the extension's web UI.
 */

export type {
  Column,
  Priority,
  CardStatus,
  Subtask,
  PlanningToolEntry,
  PlanningProgress,
  ImplementationProgress,
  ReviewProgress,
  Card,
  KanbanSettings,
  KanbanState,
} from '../../../../packages/pi-kanban-extension/shared/types';

export {
  COLUMNS,
  COLUMN_LABELS,
  PRIORITY_ORDER,
  DEFAULT_KANBAN_STATE,
  createCard,
} from '../../../../packages/pi-kanban-extension/shared/types';
