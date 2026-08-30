import { describe, expect, it } from 'vitest';
import type { ChatGoalSnapshot } from '@/types/ipc';
import { goalBannerCommands } from './goal-banner-actions';

const limitedGoal: ChatGoalSnapshot = {
  id: 'goal-1',
  objective: 'Ship the release',
  criteria: [],
  status: 'limited',
  limits: { maxAttemptsTotal: 25 },
  usage: { automaticTurns: 25, totalTokens: 10_000, costUsd: 0.2, activeMs: 60_000 },
  progress: { repeats: 0 },
  limitReached: 'maxAttemptsTotal',
};

describe('Goal banner commands', () => {
  it('raises a limited Goal budget and then resumes it', () => {
    expect(goalBannerCommands(limitedGoal, 'raise-limit')).toEqual([
      '/goal turns 50',
      '/goal resume',
    ]);
  });

  it('maps a single-state action to one Goal command', () => {
    expect(goalBannerCommands(limitedGoal, 'stop')).toEqual(['/goal stop']);
  });
});
