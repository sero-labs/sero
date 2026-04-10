/**
 * ReviewProgressTracker — tracks live review activity for a card.
 *
 * Thin subclass of BaseProgressTracker. Flushes to `card.reviewProgress`.
 */

import type { Card, ReviewProgress } from '@electron/features/kanban/core/types';
import { BaseProgressTracker, type WriteCardFn } from '@electron/features/kanban/core/base-progress';

export class ReviewProgressTracker extends BaseProgressTracker<ReviewProgress> {
  constructor(stateFilePath: string, cardId: string, writeCard: WriteCardFn) {
    super(stateFilePath, cardId, writeCard, {
      phase: 'Starting review',
      startedAt: Date.now(),
      agents: [],
      recentTools: [],
      log: [],
      liveOutput: '',
      liveOutputSource: undefined,
    });
  }

  protected buildCardUpdate(): Partial<Card> {
    return { reviewProgress: { ...this.progress } };
  }

  protected buildClearUpdate(): Partial<Card> {
    return { reviewProgress: undefined };
  }
}
