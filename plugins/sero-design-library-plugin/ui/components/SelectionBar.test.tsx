// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ItemSummary } from '../../shared/types';
import { SelectionBar } from './SelectionBar';

const SELECTED: ItemSummary = {
  id: 'item-1',
  title: 'Selected reference',
  primaryStyle: 'Editorial',
  tags: [],
  designTypes: [],
  kind: 'image',
  previewPath: '',
  analysisStatus: 'ready',
  favourite: false,
  collectionIds: ['collection-1'],
  colours: [],
  sourceKind: 'file',
  createdAt: 0,
  updatedAt: 0,
  edited: false,
  searchText: '',
};

describe('selected reference collections', () => {
  it('removes a selected reference from a checked collection', async () => {
    const onCollect = vi.fn();
    render(
      <SelectionBar
        selected={[SELECTED]}
        collections={[{ id: 'collection-1', name: 'Moodboard', colour: 'primary', createdAt: 0 }]}
        inTrash={false}
        onClear={() => {}}
        onFavourite={() => {}}
        onCollect={onCollect}
        onReanalyse={() => {}}
        onDelete={() => {}}
        onRestore={() => {}}
        onPurge={() => {}}
        onCreateDesign={() => {}}
        onRemix={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Collections' }));
    const collection = screen.getByRole('menuitemcheckbox', { name: 'Moodboard' });
    expect(collection.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(collection);

    expect(onCollect).toHaveBeenCalledWith('collection-1', false);
  });
});
