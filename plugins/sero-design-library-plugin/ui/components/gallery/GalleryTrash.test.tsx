// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GalleryFamilyRecord } from '../../../shared/gallery';
import type { GalleryActions } from '../../hooks/useGallery';
import { GalleryTrash } from './GalleryTrash';

vi.mock('../../hooks/useAssetSrc', () => ({
  useGalleryPreviewSrc: () => null,
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

const family: GalleryFamilyRecord = {
  id: 'family-one',
  schemaVersion: 1,
  createdAt: 1,
  updatedAt: 2,
  title: 'Signal Ledger',
  sourceDesignId: 'design-one',
  featuredVersionId: 'version-one',
  favourite: false,
  versions: [
    {
      id: 'version-one',
      createdAt: 1,
      title: 'Teal Passage',
      target: 'html',
      sourceVariantId: 'variant-one',
      sourceRevisionId: 'revision-one',
      previewFile: 'preview.png',
      deletedAt: 2,
    },
  ],
};

describe('Gallery Trash search', () => {
  it('filters deleted entries by family or version title', () => {
    const { rerender } = render(
      <GalleryTrash families={[family]} query="missing" actions={actions} />,
    );

    expect(screen.getByText('No Gallery Trash entry matches.')).toBeDefined();
    expect(screen.queryByText('Signal Ledger')).toBeNull();

    rerender(<GalleryTrash families={[family]} query="teal" actions={actions} />);

    expect(screen.getByText('Signal Ledger')).toBeDefined();
    expect(screen.getByText('Deleted version · Teal Passage')).toBeDefined();
  });
});
