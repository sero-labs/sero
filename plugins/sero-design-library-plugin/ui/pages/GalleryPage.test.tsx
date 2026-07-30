// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GalleryFamilyRecord } from '../../shared/gallery';
import type { GalleryActions } from '../hooks/useGallery';
import { GalleryPage } from './GalleryPage';

vi.mock('../components/gallery/GalleryCard', () => ({
  GalleryCard: ({ family }: { family: GalleryFamilyRecord }) => <div>{family.title}</div>,
}));

vi.mock('../components/gallery/GalleryTrash', () => ({
  GalleryTrash: () => <div>Gallery Trash</div>,
}));

const actions = {
  save: async () => true,
  read: async () => null,
  feature: async () => {},
  favourite: async () => {},
  open: async () => true,
  duplicate: async () => true,
  exportVersion: async () => {},
  removeFamily: async () => {},
  restoreFamily: async () => {},
  purgeFamily: async () => {},
  removeVersion: async () => {},
  restoreVersion: async () => {},
  purgeVersion: async () => {},
} satisfies GalleryActions;

function family(
  id: string,
  title: string,
  overrides: Partial<GalleryFamilyRecord> = {},
): GalleryFamilyRecord {
  return {
    id,
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: Date.now(),
    title,
    sourceDesignId: `design-${id}`,
    featuredVersionId: `version-${id}`,
    favourite: false,
    versions: [
      {
        id: `version-${id}`,
        createdAt: 1,
        title,
        target: 'html',
        sourceVariantId: `variant-${id}`,
        sourceRevisionId: `revision-${id}`,
        previewFile: 'preview.png',
      },
    ],
    ...overrides,
  };
}

describe('Gallery navigation and search', () => {
  it('shows live scope counts and filters titles with the shared search field', () => {
    const first = family('one', 'Signal Ledger', { favourite: true });
    const second = family('two', 'Quiet Atlas');
    const deletedVersion = family('three', 'Old Version', {
      versions: [
        {
          id: 'version-three',
          createdAt: 1,
          title: 'Old Version',
          target: 'html',
          sourceVariantId: 'variant-three',
          sourceRevisionId: 'revision-three',
          previewFile: 'preview.png',
          deletedAt: 2,
        },
      ],
    });

    const view = (
      families: GalleryFamilyRecord[],
    ) => (
      <GalleryPage
        families={families}
        trash={[deletedVersion]}
        actions={actions}
        onOpened={() => {}}
        onRemix={() => {}}
      />
    );

    const { rerender } = render(view([first, second]));

    expect(screen.getByRole('button', { name: 'All designs 2' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Favourites 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Recently saved 2' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Trash 1' })).toBeDefined();
    expect(screen.queryByText(/versions · families/)).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Gallery' }), {
      target: { value: 'signal' },
    });
    expect(screen.getByText('Signal Ledger')).toBeDefined();
    expect(screen.queryByText('Quiet Atlas')).toBeNull();

    rerender(view([first, { ...second, favourite: true }]));
    expect(screen.getByRole('button', { name: 'Favourites 2' })).toBeDefined();
  });
});
