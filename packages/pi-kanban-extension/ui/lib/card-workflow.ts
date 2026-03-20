import type { Card, Column, KanbanState } from '../../shared/types';
import {
  validateCardTransition,
  validateManualMove,
  validateReviewDecision,
} from '../../shared/validation';

function patchCard(
  state: KanbanState,
  cardId: string,
  updater: (card: Card, now: string) => Card,
): KanbanState {
  const now = new Date().toISOString();
  return {
    ...state,
    cards: state.cards.map((card) => (
      card.id === cardId ? updater(card, now) : card
    )),
  };
}

function setCardError(state: KanbanState, cardId: string, error: string): KanbanState {
  return patchCard(state, cardId, (card, now) => ({ ...card, error, updatedAt: now }));
}

function formatErrors(prefix: string, cardId: string, errors: string[]): string {
  return `${prefix} #${cardId}:\n${errors.map((error) => `  • ${error}`).join('\n')}`;
}

export function applyManualMove(
  state: KanbanState,
  cardId: string,
  targetColumn: Column,
): KanbanState {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return state;

  const validation = validateManualMove(card, targetColumn);
  if (!validation.valid) {
    return setCardError(state, cardId, formatErrors('Cannot move card', cardId, validation.errors));
  }

  return patchCard(state, cardId, (entry, now) => ({
    ...entry,
    column: targetColumn,
    status: 'idle',
    completedAt: targetColumn === 'backlog' ? undefined : entry.completedAt,
    previewServerId: targetColumn === 'review' ? entry.previewServerId : undefined,
    previewUrl: targetColumn === 'review' ? entry.previewUrl : undefined,
    planningProgress: undefined,
    implementationProgress: undefined,
    reviewProgress: undefined,
    error: undefined,
    updatedAt: now,
  }));
}

export function applyWorkflowTransition(
  state: KanbanState,
  cardId: string,
  targetColumn: Extract<Column, 'planning' | 'in-progress' | 'done'>,
): KanbanState {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return state;

  const validation = validateCardTransition(card, targetColumn, state);
  if (!validation.valid) {
    return setCardError(
      state,
      cardId,
      formatErrors('Cannot advance card', cardId, validation.errors),
    );
  }

  return patchCard(state, cardId, (entry, now) => {
    if (targetColumn === 'planning') {
      return {
        ...entry,
        column: 'planning',
        status: 'agent-working',
        previewServerId: undefined,
        previewUrl: undefined,
        error: undefined,
        updatedAt: now,
      };
    }

    if (targetColumn === 'in-progress') {
      return {
        ...entry,
        column: 'in-progress',
        status: 'idle',
        previewServerId: undefined,
        previewUrl: undefined,
        error: undefined,
        updatedAt: now,
      };
    }

    return {
      ...entry,
      column: 'done',
      status: 'idle',
      completedAt: entry.completedAt ?? now,
      previewServerId: undefined,
      previewUrl: undefined,
      reviewProgress: undefined,
      error: undefined,
      updatedAt: now,
    };
  });
}

/**
 * Request revisions on a PR — moves card back to in-progress with
 * agent-working status so the orchestrator picks it up with the feedback.
 */
export function applyRequestRevisions(
  state: KanbanState,
  cardId: string,
  feedback: string,
): KanbanState {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return state;
  const validation = validateReviewDecision(card);
  if (!validation.valid) {
    return setCardError(
      state,
      cardId,
      formatErrors('Cannot request revisions for card', cardId, validation.errors),
    );
  }

  return patchCard(state, cardId, (entry, now) => ({
    ...entry,
    column: 'in-progress',
    status: 'agent-working',
    error: `[REVISION REQUEST] ${feedback}`,
    previewServerId: undefined,
    previewUrl: undefined,
    reviewProgress: undefined,
    updatedAt: now,
  }));
}

/**
 * Cancel a PR — moves card back to backlog, clears all workflow state.
 * Worktree cleanup is handled by the extension via promptAgent.
 */
export function applyCancelPR(
  state: KanbanState,
  cardId: string,
): KanbanState {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return state;
  const validation = validateReviewDecision(card);
  if (!validation.valid) {
    return setCardError(
      state,
      cardId,
      formatErrors('Cannot cancel PR for card', cardId, validation.errors),
    );
  }

  return patchCard(state, cardId, (entry, now) => ({
    ...entry,
    column: 'backlog',
    status: 'idle',
    error: `[PR CANCELLED] PR was cancelled by user and card returned to backlog.`,
    prUrl: undefined,
    prNumber: undefined,
    branch: undefined,
    worktreePath: undefined,
    previewServerId: undefined,
    previewUrl: undefined,
    planningProgress: undefined,
    implementationProgress: undefined,
    reviewProgress: undefined,
    plan: undefined,
    subtasks: [],
    updatedAt: now,
  }));
}
