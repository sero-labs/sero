import { describe, expect, it } from 'vitest';

import { shouldUseLightReview } from '../../kanban/light-review';
import type { KanbanSettings } from '../../kanban/types';

function makeSettings(overrides: Partial<KanbanSettings> = {}): KanbanSettings {
  return {
    autoAdvance: true,
    maxConcurrentCards: 3,
    requireApproval: { plan: true, pr: true },
    reviewLevel: 'per-wave',
    reviewMode: 'full',
    testingEnabled: true,
    yoloMode: false,
    yoloAutoMergePrs: false,
    ...overrides,
  };
}

describe('shouldUseLightReview', () => {
  it('enables light review only for prototype mode with reviewMode=light', () => {
    expect(shouldUseLightReview(makeSettings({
      testingEnabled: false,
      reviewMode: 'light',
    }))).toBe(true);
  });

  it('disables light review for production mode', () => {
    expect(shouldUseLightReview(makeSettings({
      testingEnabled: true,
      reviewMode: 'light',
    }))).toBe(false);
  });

  it('defaults missing settings to false', () => {
    expect(shouldUseLightReview()).toBe(false);
  });
});
