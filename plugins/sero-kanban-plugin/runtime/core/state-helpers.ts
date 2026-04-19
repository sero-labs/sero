import { createDefaultKanbanState } from '../../shared/types';
import type { AppRuntimeStateApi } from '../types';
import type { Card, KanbanState } from './types';

function fallbackState(): KanbanState {
  return createDefaultKanbanState();
}

export async function updateCard(
  appState: AppRuntimeStateApi,
  stateFilePath: string,
  cardId: string,
  update: Partial<Card>,
): Promise<void> {
  await appState.update<KanbanState>(stateFilePath, (raw) => {
    const state = raw ?? fallbackState();
    return {
      ...state,
      cards: state.cards.map((card) =>
        card.id === cardId ? { ...card, ...update, updatedAt: new Date().toISOString() } : card,
      ),
    };
  });
}

export async function readCard(
  appState: AppRuntimeStateApi,
  stateFilePath: string,
  cardId: string,
): Promise<Card | null> {
  const raw = await appState.read<KanbanState>(stateFilePath);
  return raw?.cards.find((card) => card.id === cardId) ?? null;
}
