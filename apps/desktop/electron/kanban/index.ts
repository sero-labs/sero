/**
 * Kanban module — exports for the orchestrator and worktree manager.
 */

export { KanbanOrchestrator } from './orchestrator';
export { WorktreeManager } from './worktree-manager';
export type { WorktreeInfo } from './worktree-manager';
export type {
  Card,
  Column,
  KanbanState,
  KanbanSettings,
  Subtask,
  Priority,
  CardStatus,
} from './types';
