// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { emptyAnalysis } from '../../shared/librarian';
import type { ItemSummary } from '../../shared/types';
import type { LibraryActions } from '../hooks/useLibrary';
import type { ItemDetail } from '../hooks/useItemDetail';

const mocks = vi.hoisted(() => ({ useItemDetail: vi.fn() }));
vi.mock('../hooks/useItemDetail', () => ({ useItemDetail: mocks.useItemDetail }));

// eslint-disable-next-line import/first -- the hook mock must be registered first
import { ItemInspector } from './ItemInspector';

const ITEM: ItemSummary = {
  id: 'item-1',
  title: 'Generated surface',
  primaryStyle: 'Editorial',
  tags: [],
  designTypes: [],
  kind: 'image',
  previewPath: 'items/item-1/preview.png',
  analysisStatus: 'ready',
  favourite: false,
  collectionIds: [],
  colours: [],
  sourceKind: 'generated',
  createdAt: 1,
  updatedAt: 2,
  edited: false,
};

const ACTIONS: LibraryActions = {
  setScope: vi.fn(),
  setQuery: vi.fn(),
  setFilters: vi.fn(),
  setSort: vi.fn(),
  select: vi.fn(),
  setField: vi.fn(),
  resetField: vi.fn(),
  favourite: vi.fn(),
  collect: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
  reanalyse: vi.fn(),
  cancelAnalysis: vi.fn(),
  createCollection: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  updateSettings: vi.fn(),
};

function detail(generated: boolean): ItemDetail {
  return {
    id: ITEM.id,
    analysis: emptyAnalysis(ITEM.title),
    overridden: [],
    confidence: 0.8,
    updatedAt: 2,
    createdAt: 1,
    fileName: 'surface.png',
    width: 1280,
    height: 720,
    bytes: 400,
    ...(generated
      ? {
          generation: {
            capability: 'text-to-image' as const,
            prompt: 'A dark metallic hero surface',
            model: 'fal-ai/flux/dev',
          },
        }
      : {}),
  };
}

describe('generation provenance', () => {
  it('shows the original prompt last for a generated reference', () => {
    mocks.useItemDetail.mockReturnValue(detail(true));
    render(<ItemInspector item={ITEM} revision={1} actions={ACTIONS} onClose={() => {}} />);

    expect(screen.getByText('Original request')).toBeDefined();
    expect(screen.getByText('A dark metallic hero surface')).toBeDefined();
    expect(screen.getByText('fal-ai/flux/dev')).toBeDefined();
    const sections = screen.getAllByRole('heading', { level: 3 });
    expect(sections.at(-1)?.textContent).toBe('Original request');
  });

  it('does not add provenance to an imported reference', () => {
    mocks.useItemDetail.mockReturnValue(detail(false));
    render(<ItemInspector item={ITEM} revision={1} actions={ACTIONS} onClose={() => {}} />);

    expect(screen.queryByText('Original request')).toBeNull();
  });
});
