import { describe, expect, it } from 'vitest';

import type { JobSummary } from '../../shared/types';
import { pendingGenerations } from './pending-generations';

/**
 * Which generations still need a tile. Pure, so it runs node-side: the rule is
 * about job state, not about markup.
 */

function job(overrides: Partial<JobSummary> & { id: string }): JobSummary {
  return {
    kind: 'media',
    status: 'running',
    target: { kind: 'library', slotId: `slot-${overrides.id}` },
    createdAt: 0,
    ...overrides,
  };
}

describe('which jobs get a tile', () => {
  it('shows work in flight and failures, not work that has landed', () => {
    const shown = pendingGenerations([
      job({ id: 'a', status: 'queued' }),
      job({ id: 'b', status: 'running' }),
      job({ id: 'c', status: 'failed' }),
      // Succeeded: its item is in the grid by now, so a tile would double it.
      job({ id: 'd', status: 'succeeded' }),
      job({ id: 'e', status: 'cancelled' }),
    ]);

    expect(shown.map((entry) => entry.jobId)).toEqual(['a', 'b', 'c']);
  });

  it('ignores jobs that are not generating into the Library', () => {
    const shown = pendingGenerations([
      job({ id: 'a' }),
      job({ id: 'b', target: { kind: 'asset', designId: 'd1', assetId: 'a1' } }),
      job({ id: 'c', target: { kind: 'item', itemId: 'i1' } }),
    ]);

    expect(shown).toHaveLength(1);
  });

  it('keeps them in the order they were asked for', () => {
    const shown = pendingGenerations([
      job({ id: 'second', createdAt: 20 }),
      job({ id: 'first', createdAt: 10 }),
    ]);

    expect(shown.map((entry) => entry.jobId)).toEqual(['first', 'second']);
  });

  it('carries the slot the request named, so a replay finds this job', () => {
    const [first] = pendingGenerations([job({ id: 'a' })]);

    expect(first?.slotId).toBe('slot-a');
  });
});
