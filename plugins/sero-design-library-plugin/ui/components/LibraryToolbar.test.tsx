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

  it('shows aligned previews beside colour codes', async () => {
    render(
      <LibraryToolbar
        query=""
        filters={FILTERS}
        facets={{ styles: [], tags: [], colours: ['#03090c', '#f4a261'], sourceKinds: [] }}
        sort="newest"
        onQueryChange={() => {}}
        onFiltersChange={() => {}}
        onSortChange={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Colour' }));

    const option = screen.getByRole('option', { name: '#03090c' });
    const swatch = option.querySelector('[aria-hidden="true"]');
    expect(swatch?.getAttribute('style')).toContain('background-color: rgb(3, 9, 12)');
    expect(swatch?.className).toContain('w-8');
    expect(swatch?.className).toContain('h-4');
    expect(swatch?.className).toContain('shrink-0');
  });
});
