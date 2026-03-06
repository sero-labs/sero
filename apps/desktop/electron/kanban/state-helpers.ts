/**
 * Kanban state helpers — atomic read/update operations for card state.
 *
 * Extracted from orchestrator.ts for file-size compliance.
 * Uses appStateManager.update() for atomic read-modify-write.
 */

import type { Card, KanbanState } from './types';
import { DEFAULT_KANBAN_STATE } from './types';
import { appStateManager } from '../app-state';

/** Fallback state used when the file is empty/missing. */
function fallbackState(): KanbanState {
  return { ...DEFAULT_KANBAN_STATE, cards: [] };
}

/** Atomically update a single card's fields in the state file. */
export async function updateCard(
  stateFilePath: string,
  cardId: string,
  update: Partial<Card>,
): Promise<void> {
  await appStateManager.update<KanbanState>(stateFilePath, (raw) => {
    const state = raw ?? fallbackState();
    return {
      ...state,
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, ...update, updatedAt: new Date().toISOString() } : c,
      ),
    };
  });
}

/** Read a single card from the state file. */
export async function readCard(
  stateFilePath: string,
  cardId: string,
): Promise<Card | null> {
  const raw = await appStateManager.read(stateFilePath) as KanbanState | null;
  return raw?.cards.find((c) => c.id === cardId) ?? null;
}
