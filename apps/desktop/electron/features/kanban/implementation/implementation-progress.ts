/**
 * ImplementationProgressTracker — tracks live implementation activity.
 *
 * Extends BaseProgressTracker with optional staged-execution tracking.
 * Flushes to `card.implementationProgress`.
 */

import type { Card, ImplementationProgress } from '../core/types';
import { BaseProgressTracker, type WriteCardFn } from '../core/base-progress';

export class ImplementationProgressTracker extends BaseProgressTracker<ImplementationProgress> {
  constructor(stateFilePath: string, cardId: string, writeCard: WriteCardFn) {
    super(stateFilePath, cardId, writeCard, {
      phase: 'Starting implementation',
      startedAt: Date.now(),
      currentWave: 0,
      totalWaves: 0,
      agents: [],
      recentTools: [],
      log: [],
      liveOutput: '',
      liveOutputSource: undefined,
    });
  }

  /** Preserve support for legacy phase labels like "Wave 2/5". */
  protected onPhaseChange(phase: string): void {
    const waveMatch = phase.match(/Wave (\d+)\/(\d+)/);
    if (waveMatch) {
      this.progress.currentWave = parseInt(waveMatch[1], 10);
      this.progress.totalWaves = parseInt(waveMatch[2], 10);
    }
  }

  protected buildCardUpdate(): Partial<Card> {
    return { implementationProgress: { ...this.progress } };
  }

  protected buildClearUpdate(): Partial<Card> {
    return { implementationProgress: undefined };
  }
}
