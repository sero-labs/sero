import path from 'path';
import type { Card, KanbanSettings } from '../../core/types';
import type { KanbanRuntimeHost } from '../../types';

export interface ReviewExecutorDeps {
  host: KanbanRuntimeHost;
  workspaceId: string;
  settings?: KanbanSettings;
}

export interface ReviewExecutorResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  previewServerId?: string;
  previewUrl?: string;
  reviewFilePath?: string;
  error?: string;
}

export interface ReviewExecutionPaths {
  workspaceRoot: string;
  reviewDir: string;
  reviewFile: string;
  reviewRelPath: string;
}

export function resolveReviewExecutionPaths(
  worktreePath: string,
  cardId: Card['id'],
): ReviewExecutionPaths {
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
