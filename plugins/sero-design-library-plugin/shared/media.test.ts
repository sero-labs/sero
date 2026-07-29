import { describe, expect, it } from 'vitest';

import type { DesignAsset } from './media';
import { assetCostUsd, normalizeDesignAsset } from './media';

function asset(overrides: Partial<DesignAsset> = {}): DesignAsset {
  return {
    id: 'asset-1',
    kind: 'image',
    reference: 'assets/asset-1.png',
    request: { capability: 'text-to-image', prompt: 'Artwork' },
    attempts: [
      {
        id: 'attempt-1',
        outcome: 'ready',
        startedAt: 1,
        completedAt: 2,
        provenance: {
          providerId: 'fake',
          capability: 'text-to-image',
          model: 'fake/image',
          prompt: 'Artwork',
          parameters: {},
          costUsd: 0.08,
          startedAt: 1,
          completedAt: 2,
        },
      },
    ],
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('Design reference assets', () => {
  it('keeps source identity when a Design record is read', () => {
    expect(normalizeDesignAsset(asset({ sourceItemId: 'item-1' }))?.sourceItemId).toBe('item-1');
  });

  it('retains provenance without counting the old generation cost again', () => {
    expect(assetCostUsd(asset())).toBe(0.08);
    expect(assetCostUsd(asset({ sourceItemId: 'item-1' }))).toBe(0.08);
  });
});
