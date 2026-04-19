import type { Card, Column, KanbanState } from '../../shared/types';
import { validateManualMove } from '../../shared/validation';

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

