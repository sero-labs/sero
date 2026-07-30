// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { GalleryFamilyRecord } from '../../../shared/gallery';
import { GalleryCard } from './GalleryCard';

vi.mock('../../hooks/useAssetSrc', () => ({
  useGalleryPreviewSrc: () => 'data:image/png;base64,cHJldmlldw==',
}));

const family: GalleryFamilyRecord = {
  id: 'fam-1',
  schemaVersion: 1,
  createdAt: 1,
  updatedAt: 2,
  title: 'Signal Ledger',
  sourceDesignId: 'dsn-1',
  featuredVersionId: 'ver-2',
  favourite: false,
  versions: [
    {
      id: 'ver-1', createdAt: 1, title: 'First', target: 'html',
      sourceVariantId: 'var-1', sourceRevisionId: 'rev-1', previewFile: 'preview.png',
    },
    {
      id: 'ver-2', createdAt: 2, title: 'Second', target: 'html',
      sourceVariantId: 'var-1', sourceRevisionId: 'rev-2', previewFile: 'preview.png',
    },
  ],
};

describe('Gallery family card', () => {
  it('selects an exact version for open, Duplicate and Remix', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDuplicate = vi.fn();
    const onRemix = vi.fn();
    const onExport = vi.fn();
    render(
      <GalleryCard
        family={family}
        onOpen={onOpen}
        onFeature={vi.fn()}
        onFavourite={vi.fn()}
        onDelete={vi.fn()}
        onDeleteVersion={vi.fn()}
        onDuplicate={onDuplicate}
        onRemix={onRemix}
        onExport={onExport}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Version'), 'ver-1');
    await user.click(screen.getByRole('button', { name: 'Open Design' }));
    await user.click(screen.getByRole('button', { name: 'Gallery family actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await user.click(screen.getByRole('button', { name: 'Gallery family actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remix' }));
    await user.click(screen.getByRole('button', { name: 'Gallery family actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export to Downloads' }));

    expect(onOpen).toHaveBeenCalledWith('ver-1');
    expect(onDuplicate).toHaveBeenCalledWith('ver-1');
    expect(onRemix).toHaveBeenCalledWith('ver-1');
    expect(onExport).toHaveBeenCalledWith('ver-1', 'downloads');
  });
});
