import { appStateManager } from '@electron/features/apps/state/manager';
import { updateCard } from '@electron/features/kanban/core/state-helpers';
import { closePullRequest, deleteReviewCache } from './review-artifacts';
import type { WorktreeManager } from '@electron/features/kanban/worktree/worktree-manager';
import type { Card } from '@electron/features/kanban/core/types';

const ERROR_LOG_FILENAME = 'errors.json';
const REVISION_REQUEST_PREFIX = '[REVISION REQUEST] ';
const PR_CANCELLED_PREFIX = '[PR CANCELLED]';
const RECENT_ACTION_DEDUPE_WINDOW_MS = 10_000;

interface ErrorReport {
  id: string;
  cardId: string;
  cardTitle: string;
  phase: 'planning' | 'implementation' | 'review';
  agentName: string;
  severity: 'error' | 'warning' | 'test-failure';
  message: string;
  timestamp: string;
}

interface ErrorLog {
  errors: ErrorReport[];
  lastRetrospectiveAt?: string;
}

interface ReviewActionEffectContext {
  stateFilePath: string;
  workspacePath: string;
  worktreeManager: WorktreeManager;
}

export async function applyReviewActionEffects(
  ctx: ReviewActionEffectContext,
  previousCard: Card | undefined,
  currentCard: Card,
): Promise<void> {
  if (isRevisionRequestTransition(previousCard, currentCard)) {
    const feedback = currentCard.error?.slice(REVISION_REQUEST_PREFIX.length).trim();
    if (!feedback) return;

    await deleteReviewCache(ctx.workspacePath, currentCard.id, previousCard?.reviewFilePath);
    await appendReviewActionError(
      ctx.stateFilePath,
      currentCard.id,
      currentCard.title,
      `Revision requested: ${feedback}`,
    );
    return;
  }

  if (!isCancelPrTransition(previousCard, currentCard)) {
    return;
  }

  if (previousCard?.prNumber) {
    try {
      await closePullRequest(ctx.workspacePath, previousCard.prNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await restoreCancelledCard(ctx.stateFilePath, previousCard, message);
      return;
    }
  }

  await deleteReviewCache(ctx.workspacePath, currentCard.id, previousCard?.reviewFilePath);

  try {
    await ctx.worktreeManager.remove(ctx.workspacePath, currentCard.id, {
      deleteBranch: true,
      force: true,
    });
  } catch (err) {
    console.error(
      `[kanban-orchestrator] Failed to clean up cancelled PR worktree for card #${currentCard.id}:`,
      err,
    );
  }

  await appendReviewActionError(
    ctx.stateFilePath,
    currentCard.id,
    currentCard.title,
    'PR cancelled by user — card returned to backlog',
  );
}

function isRevisionRequestTransition(previousCard: Card | undefined, currentCard: Card): boolean {
  return isReviewDecisionSource(previousCard)
    && currentCard.column === 'in-progress'
    && currentCard.status === 'agent-working'
    && currentCard.error?.startsWith(REVISION_REQUEST_PREFIX) === true;
}

function isCancelPrTransition(previousCard: Card | undefined, currentCard: Card): boolean {
  return isReviewDecisionSource(previousCard)
    && currentCard.column === 'backlog'
    && currentCard.status === 'idle'
    && currentCard.error?.startsWith(PR_CANCELLED_PREFIX) === true;
}

function isReviewDecisionSource(card: Card | undefined): boolean {
  return card?.column === 'review' && card.status === 'waiting-input' && !!card.prUrl;
}

async function restoreCancelledCard(
  stateFilePath: string,
  previousCard: Card,
  failure: string,
): Promise<void> {
  await updateCard(stateFilePath, previousCard.id, {
    column: 'review',
    status: 'waiting-input',
    branch: previousCard.branch,
    worktreePath: previousCard.worktreePath,
    subtasks: previousCard.subtasks,
    plan: previousCard.plan,
    prUrl: previousCard.prUrl,
    prNumber: previousCard.prNumber,
    previewServerId: previousCard.previewServerId,
    previewUrl: previousCard.previewUrl,
    reviewFilePath: previousCard.reviewFilePath,
    error: `Cancel PR failed: ${failure}`,
  });
}

async function appendReviewActionError(
  stateFilePath: string,
  cardId: string,
  cardTitle: string,
  message: string,
): Promise<void> {
  await appStateManager.update<ErrorLog>(resolveErrorLogPath(stateFilePath), (current) => {
    const log = normalizeErrorLog(current);
    if (hasRecentMatchingError(log.errors, cardId, message)) {
      return log;
    }
    return {
      ...log,
      errors: [
        ...log.errors,
        createErrorReport(cardId, cardTitle, message),
      ],
    };
  });
}

function createErrorReport(cardId: string, cardTitle: string, message: string): ErrorReport {
  const timestamp = new Date().toISOString();
  const timePart = Date.parse(timestamp);
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `err-${Number.isNaN(timePart) ? Date.now() : timePart}-${suffix}`,
    cardId,
    cardTitle,
    phase: 'review',
    agentName: 'user',
    severity: 'warning',
    message,
    timestamp,
  };
}

function hasRecentMatchingError(errors: ErrorReport[], cardId: string, message: string): boolean {
  const cutoff = Date.now() - RECENT_ACTION_DEDUPE_WINDOW_MS;
  return errors.some((error) =>
    error.cardId === cardId
    && error.message === message
    && Date.parse(error.timestamp) >= cutoff,
  );
}

function normalizeErrorLog(raw: unknown): ErrorLog {
  const data = raw as Partial<ErrorLog> | null | undefined;
  return {
    errors: Array.isArray(data?.errors) ? [...data.errors] : [],
    lastRetrospectiveAt:
      typeof data?.lastRetrospectiveAt === 'string' ? data.lastRetrospectiveAt : undefined,
  };
}

function resolveErrorLogPath(stateFilePath: string): string {
  const slashIndex = Math.max(stateFilePath.lastIndexOf('/'), stateFilePath.lastIndexOf('\\'));
  if (slashIndex === -1) {
    return ERROR_LOG_FILENAME;
  }
  return `${stateFilePath.slice(0, slashIndex + 1)}${ERROR_LOG_FILENAME}`;
}
