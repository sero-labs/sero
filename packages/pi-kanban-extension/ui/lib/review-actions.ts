import { getSeroApi } from '@sero/app-runtime';

import type { Card } from '../../shared/types';
import {
  buildCancelPrError,
  buildRevisionRequestError,
  appendReviewActionError,
} from './error-log-client';

interface ReviewActionContext {
  stateFilePath: string;
  workspaceId: string;
  workspacePath: string;
}

export async function persistRevisionRequest(
  ctx: ReviewActionContext,
  card: Pick<Card, 'id' | 'title'>,
  feedback: string,
): Promise<void> {
  await appendReviewActionError(ctx.stateFilePath, buildRevisionRequestError(card, feedback));
}

export async function persistPrCancellation(
  ctx: ReviewActionContext,
  card: Pick<Card, 'id' | 'title' | 'worktreePath'>,
): Promise<void> {
  const { editor } = getSeroApi();
  if (!editor) {
    throw new Error('Kanban review actions are unavailable in this runtime.');
  }

  const worktreePath = resolveWorktreePath(ctx.workspacePath, card);
  const command = [
    'set -e',
    `if git worktree remove ${shellQuote(worktreePath)} --force; then`,
    '  true',
    'else',
    `  rm -rf ${shellQuote(worktreePath)}`,
    'fi',
    'git worktree prune || true',
  ].join('\n');
  const result = await editor.exec(ctx.workspaceId, command);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to remove the review worktree.');
  }

  await appendReviewActionError(ctx.stateFilePath, buildCancelPrError(card));
}

function resolveWorktreePath(
  workspacePath: string,
  card: Pick<Card, 'id' | 'worktreePath'>,
): string {
  const prefix = workspacePath.endsWith('/') ? workspacePath : `${workspacePath}/`;
  if (card.worktreePath?.startsWith(prefix)) {
    return card.worktreePath.slice(prefix.length);
  }
  return `.sero/worktrees/card-${card.id}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
