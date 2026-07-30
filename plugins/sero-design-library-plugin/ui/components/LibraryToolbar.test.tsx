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
          colours: [],
          sourceKinds: [],
        }}
        sort="newest"
        onQueryChange={() => {}}
        onFiltersChange={onFiltersChange}
        onSortChange={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Style' }));
    fireEvent.change(screen.getByPlaceholderText('Search style'), {
      target: { value: 'Style 999' },
    });
    await userEvent.click(screen.getByRole('option', { name: 'Style 999' }));

    expect(onFiltersChange).toHaveBeenCalledWith({ ...FILTERS, styles: ['Style 999'] });
  });
});
