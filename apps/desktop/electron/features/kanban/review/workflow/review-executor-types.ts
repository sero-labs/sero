import path from 'path';
import type { Card, KanbanSettings } from '@electron/features/kanban/core/types';
import type { SubagentManager } from '@electron/features/subagent';

export interface ReviewExecutorDeps {
  subagentManager: SubagentManager;
  workspaceId: string;
  settings?: KanbanSettings;
}

export interface ReviewExecutorResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  previewServerId?: string;
  previewUrl?: string;
  /** Relative path to the cached review file (set when review is generated). */
  reviewFilePath?: string;
  error?: string;
}

export interface ReviewExecutionPaths {
  workspaceRoot: string;
  reviewDir: string;
  reviewFile: string;
  reviewRelPath: string;
}

export function resolveReviewExecutionPaths(worktreePath: string, cardId: Card['id']): ReviewExecutionPaths {
  const workspaceRoot = path.resolve(worktreePath, '..', '..', '..');
  const reviewDir = path.join(workspaceRoot, '.sero', 'apps', 'kanban', 'reviews');
  const reviewFile = path.join(reviewDir, `card-${cardId}.json`);
  return {
    workspaceRoot,
    reviewDir,
    reviewFile,
    reviewRelPath: path.relative(workspaceRoot, reviewFile),
  };
}
