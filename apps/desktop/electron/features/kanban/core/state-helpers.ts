/**
 * Kanban state helpers — atomic read/update operations for card state.
 *
 * Extracted from orchestrator.ts for file-size compliance.
 * Uses appStateManager.update() for atomic read-modify-write.
 */

import { createDefaultKanbanState } from '@sero/common';
import { appStateManager } from '@electron/features/apps/state/manager';

import type { Card, KanbanState } from './types';

/** Fallback state used when the file is empty/missing. */
function fallbackState(): KanbanState {
  return createDefaultKanbanState();
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
