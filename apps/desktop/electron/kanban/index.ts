/**
 * Kanban module — exports for the orchestrator and worktree manager.
 */

export { KanbanOrchestrator } from './orchestrator';
export { WorktreeManager, ensureGitReady } from './worktree-manager';
export { resolveExecutionWaves } from './wave-resolver';
export { updateCard, readCard } from './state-helpers';
export {
  validateTransition,
  getContract,
  getUnmetDependencies,
  getNewlyUnblockedCards,
  getAllReadyBacklogCards,
} from './contracts';
export type { StageContract, QualityGate, ValidationResult } from './contracts';
export {
  detectVerificationCommands,
  detectPackageManager,
  runVerificationCommands,
} from './verification';
export type { VerificationResult, CommandResult } from './verification';
export {
  createCheckpointInWorktree,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
  createPrFromWorktree,
} from './worktree-git';
export type { WriteCardFn } from './base-progress';
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
