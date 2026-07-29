// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ItemSummary } from '../../shared/types';

/**
 * What a card asks for, which is a spend and a correctness problem before it is
 * a cosmetic one.
 *
 * A generated clip has no thumbnail of its own when it lands, and an item's
 * stored preview falls back to the original when it has none — so a card that
 * asks immediately gets the whole video back, paints it into an `img` where it
 * cannot render, and caches several megabytes under a key that never changes
 * again. The still that arrives moments later is then never fetched.
 */

const runs: Record<string, unknown>[] = [];

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({
    run: async (_name: string, params: Record<string, unknown>) => {
      runs.push(params);
      return { content: [], details: {} };
    },
  }),
}));

// eslint-disable-next-line import/first -- must follow the mock above
import { ItemCard } from './ItemCard';

function item(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    id: 'item-1',
    title: 'Elemental Afterdark',
    kind: 'video',
    analysisStatus: 'ready',
    collectionIds: [],
    favourite: false,
    tags: [],
    ...overrides,
  } as ItemSummary;
}

function renderCard(summary: ItemSummary) {
  runs.length = 0;
  return render(
    <ItemCard item={summary} selected={false} onOpen={vi.fn()} onToggleSelect={vi.fn()} />,
  );
}

describe('a clip whose frames have not been captured', () => {
  it('asks for nothing and says what it is waiting for', () => {
    renderCard(item({ awaitingFrames: true }));

    expect(runs).toHaveLength(0);
    expect(screen.getByText('Capturing frames…')).toBeDefined();
  });

  it('asks once the still exists', () => {
    renderCard(item());

    expect(runs).toEqual([{ action: 'preview', itemId: 'item-1' }]);
  });
});
