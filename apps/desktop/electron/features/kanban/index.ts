/**
 * Kanban module — exports for the orchestrator and worktree manager.
 */

export { KanbanOrchestrator } from './core/orchestrator';
export { WorktreeManager, ensureGitReady } from './worktree/worktree-manager';
export { resolveExecutionWaves } from './core/wave-resolver';
export { updateCard, readCard } from './core/state-helpers';
export {
  validateTransition,
  getContract,
  getUnmetDependencies,
  getNewlyUnblockedCards,
  getAllReadyBacklogCards,
} from './core/contracts';
export type { StageContract, QualityGate, ValidationResult } from './core/contracts';
export {
  detectVerificationCommands,
  detectPackageManager,
  runVerificationCommands,
} from './quality/verification';
export type { VerificationResult, CommandResult } from './quality/verification';
export {
  createCheckpointInWorktree,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
  createPrFromWorktree,
} from './worktree/worktree-git';
export type { WriteCardFn } from './core/base-progress';
export type { WorktreeInfo } from './worktree/worktree-manager';
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
} from './core/types';
