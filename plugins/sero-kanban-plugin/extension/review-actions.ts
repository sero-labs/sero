import type { KanbanState } from '../shared/types';
import { COLUMN_LABELS } from '../shared/types';
import { resolveWorkspacePathFromStatePath } from '../shared/error-log';
import { validateReviewDecision } from '../shared/validation';
import { appendError } from './error-log';
import { formatCleanupWarnings } from './cleanup-warnings';
import { closePullRequest, deleteReviewCache } from './review-artifacts';
import { writeState } from './state-io';
import { removeWorktree } from './worktree-cleanup';

type ToolResult = { content: { type: 'text'; text: string }[]; details: Record<string, never> };

function text(msg: string): ToolResult {
  return { content: [{ type: 'text', text: msg }], details: {} };
}

function formatReviewDecisionError(
  cardId: string,
  actionLabel: string,
  state: KanbanState,
): ToolResult {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) {
    return text(`Card #${cardId} not found`);
  }

  const validation = validateReviewDecision(card);
  if (validation.valid) {
    return text(`Cannot ${actionLabel.toLowerCase()} card #${card.id}.`);
  }

  const location = card.column === 'review'
    ? 'Review'
    : `"${COLUMN_LABELS[card.column]}"`;
  return text(
    `Cannot ${actionLabel.toLowerCase()} #${card.id} while it is in ${location}:\n`
    + validation.errors.map((error) => `  • ${error}`).join('\n'),
  );
}

export async function recordCleanupWarnings(
  statePath: string,
  card: KanbanState['cards'][number],
  warnings: string[],
): Promise<void> {
  for (const warning of warnings) {
    await appendError(statePath, {
      cardId: card.id,
      cardTitle: card.title,
      phase: 'review',
      agentName: 'system',
      severity: 'warning',
      message: warning,
    });
  }
}

export async function handleRequestRevisions(
  statePath: string,
  state: KanbanState,
  id: string,
  feedback: string,
): Promise<ToolResult> {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return text(`Card #${id} not found`);

  const validation = validateReviewDecision(card);
  if (!validation.valid) {
    return formatReviewDecisionError(id, 'Request Revisions', state);
  }

  const reviewFilePath = card.reviewFilePath;
  card.column = 'in-progress';
  card.status = 'agent-working';
  card.error = `[REVISION REQUEST] ${feedback}`;
  card.previewServerId = undefined;
  card.previewUrl = undefined;
  card.reviewFilePath = undefined;
  card.reviewProgress = undefined;
  card.updatedAt = new Date().toISOString();
  const warnings = (await deleteReviewCache(
    resolveWorkspacePathFromStatePath(statePath),
    card.id,
    reviewFilePath,
  )) ?? [];
  await writeState(statePath, state);

  await appendError(statePath, {
    cardId: card.id,
    cardTitle: card.title,
    phase: 'review',
    agentName: 'user',
    severity: 'warning',
    message: `Revision requested: ${feedback}`,
  });
  await recordCleanupWarnings(statePath, card, warnings);

  return text(
    `Revision requested for #${card.id} "${card.title}" — moved back to In Progress. The orchestrator will address the feedback.`
    + formatCleanupWarnings(warnings),
  );
}

export async function handleCancelPR(
  statePath: string,
  state: KanbanState,
  workspacePath: string,
  id: string,
): Promise<ToolResult> {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return text(`Card #${id} not found`);

  const validation = validateReviewDecision(card);
  if (!validation.valid) {
    return formatReviewDecisionError(id, 'Cancel PR', state);
  }

  if (card.prNumber) {
    try {
      await closePullRequest(workspacePath, card.prNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return text(`Failed to cancel PR for #${card.id}: ${message}`);
    }
  }

  const warnings: string[] = [];
  if (card.worktreePath) {
    warnings.push(...((await removeWorktree(workspacePath, card.worktreePath)) ?? []));
  }
  warnings.push(...((await deleteReviewCache(workspacePath, card.id, card.reviewFilePath)) ?? []));

  card.column = 'backlog';
  card.status = 'idle';
  card.error = '[PR CANCELLED] PR was cancelled by user and card returned to backlog.';
  card.prUrl = undefined;
  card.prNumber = undefined;
  card.branch = undefined;
  card.worktreePath = undefined;
  card.previewServerId = undefined;
  card.previewUrl = undefined;
  card.reviewFilePath = undefined;
  card.planningProgress = undefined;
  card.implementationProgress = undefined;
  card.reviewProgress = undefined;
  card.plan = undefined;
  card.subtasks = [];
  card.updatedAt = new Date().toISOString();
  await writeState(statePath, state);

  await appendError(statePath, {
    cardId: card.id,
    cardTitle: card.title,
    phase: 'review',
    agentName: 'user',
    severity: 'warning',
    message: 'PR cancelled by user — card returned to backlog',
  });
  await recordCleanupWarnings(statePath, card, warnings);

  return text(
    `Cancelled PR for #${card.id} "${card.title}" — closed on GitHub, moved back to Backlog, and cleaned up locally.`
    + formatCleanupWarnings(warnings),
  );
}
