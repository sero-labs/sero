// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { LibraryFilters } from '../../shared/types';
import { LibraryToolbar } from './LibraryToolbar';

const FILTERS: LibraryFilters = {
  mediaKinds: [],
  styles: [],
  tags: [],
  colours: [],
  sourceKinds: [],
  analysisStatuses: [],
};

describe('large Library facets', () => {
  it('uses searchable multi-select options instead of a long unfiltered menu', async () => {
    const onFiltersChange = vi.fn();
    render(
      <LibraryToolbar
        query=""
        filters={FILTERS}
        facets={{
          styles: Array.from({ length: 1_000 }, (_, index) => `Style ${index}`),
          tags: [],
          colours: ['#03090c', '#f4a261'],
          sourceKinds: [],
        }}
        sort="newest"
        onQueryChange={() => {}}
        onFiltersChange={onFiltersChange}
        onSortChange={() => {}}
      />,
    );

    const style = screen.getByRole('combobox', { name: 'Style' });
    await userEvent.click(style);
    fireEvent.change(style, {
      target: { value: 'Style 999' },
    });
    await userEvent.click(screen.getByRole('option', { name: 'Style 999' }));

    expect(onFiltersChange).toHaveBeenCalledWith({ ...FILTERS, styles: ['Style 999'] });
    expect(screen.getByRole('listbox')).toBeDefined();
  });

  it('groups exact colours into named families', async () => {
    const onFiltersChange = vi.fn();
    render(
      <LibraryToolbar
        query=""
        filters={FILTERS}
        facets={{
          styles: [],
          tags: [],
          colours: ['#e53935', '#b71c1c', '#43a047', '#1e88e5', '#777777'],
          sourceKinds: [],
        }}
        sort="newest"
        onQueryChange={() => {}}
        onFiltersChange={onFiltersChange}
        onSortChange={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Colour' }));

    expect(screen.getByRole('option', { name: 'Reds' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Greens' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Blues' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Neutrals' })).toBeDefined();
    expect(screen.queryByRole('option', { name: '#e53935' })).toBeNull();

    await userEvent.click(screen.getByRole('option', { name: 'Reds' }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...FILTERS,
      colours: ['#e53935', '#b71c1c'],
    });
  });
});
