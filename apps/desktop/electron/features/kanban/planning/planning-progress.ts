/**
 * PlanningProgressTracker — tracks live planning activity for a single card.
 *
 * Thin subclass of BaseProgressTracker. Flushes to `card.planningProgress`.
 */

import type { Card, PlanningProgress } from '../core/types';
import { BaseProgressTracker, type WriteCardFn } from '../core/base-progress';

export class PlanningProgressTracker extends BaseProgressTracker<PlanningProgress> {
  constructor(stateFilePath: string, cardId: string, writeCard: WriteCardFn) {
    super(stateFilePath, cardId, writeCard, {
      phase: 'Planning task',
      startedAt: Date.now(),
      agents: [],
      recentTools: [],
      log: [],
      liveOutput: '',
      liveOutputSource: undefined,
    });
  }

  protected buildCardUpdate(): Partial<Card> {
    return { planningProgress: { ...this.progress } };
  }

  protected buildClearUpdate(): Partial<Card> {
    return { planningProgress: undefined };
  }
}
