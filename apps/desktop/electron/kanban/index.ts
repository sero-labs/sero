/**
 * Kanban module — exports for the orchestrator and worktree manager.
 */

export { KanbanOrchestrator } from './orchestrator';
export { WorktreeManager, ensureGitReady } from './worktree-manager';
export { resolveExecutionWaves } from './wave-resolver';
export {
  createCheckpointInWorktree,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
  createPrFromWorktree,
} from './worktree-git';
export type { WorktreeInfo } from './worktree-manager';
export type {
  Card,
  Column,
  KanbanState,
  KanbanSettings,
  Subtask,
  Priority,
  CardStatus,
  ImplementationProgress,
  ReviewProgress,
} from './types';
