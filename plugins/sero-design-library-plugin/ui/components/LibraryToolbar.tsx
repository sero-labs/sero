import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  SearchInput,
} from '@sero-ai/ui';
import { ArrowDownUp } from 'lucide-react';
import { useState } from 'react';

import type { LibraryFacets } from '../../shared/search';
import type { LibraryFilters, LibrarySort } from '../../shared/types';

/**
 * Search and lightweight filters, sitting above the work rather than beside
 * it. Each menu toggles values within one facet; facets combine with AND and
 * values within a facet combine with OR.
 */

interface LibraryToolbarProps {
  query: string;
  filters: LibraryFilters;
  facets: LibraryFacets;
  sort: LibrarySort;
  onQueryChange(query: string): void;
  onFiltersChange(filters: LibraryFilters): void;
  onSortChange(sort: LibrarySort): void;
}

const SORT_LABELS: Record<LibrarySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'By title',
};

interface FacetMenuProps<Value extends string> {
  label: string;
  options: Value[];
  selected: Value[];
  onChange(values: Value[]): void;
}

function FacetMenu<Value extends string>({
  label,
  options,
  selected,
  onChange,
}: FacetMenuProps<Value>) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  const items = options.map((option) => ({ value: option, label: option }));
  const selectedValues = new Set(selected);
  const chosen = items.filter((item) => selectedValues.has(item.value));

  return (
    <Combobox
      items={items}
      multiple
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && details.reason === 'item-press') return;
        setOpen(nextOpen);
      }}
      value={chosen}
      isItemEqualToValue={(item, value) => item.value === value.value}
      onValueChange={(values) => onChange(values.map((value) => value.value))}
    >
      <ComboboxInput
        aria-label={label}
        placeholder={selected.length > 0 ? `${label} (${selected.length})` : label}
        className="h-8 w-32"
      />
      <ComboboxContent className="min-w-64">
        <ComboboxEmpty>No options found</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function LibraryToolbar({
  query,
  filters,
  facets,
  sort,
  onQueryChange,
  onFiltersChange,
  onSortChange,
}: LibraryToolbarProps) {
  const active =
    filters.styles.length +
    filters.tags.length +
    filters.colours.length +
    filters.sourceKinds.length +
    filters.mediaKinds.length;

  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
      <SearchInput
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search styles, tags, notes or analysis"
        className="h-8 max-w-96 min-w-56 flex-1"
      />

      <FacetMenu
        label="Media"
        options={['image', 'video'] satisfies LibraryFilters['mediaKinds']}
        selected={filters.mediaKinds}
        onChange={(mediaKinds) => onFiltersChange({ ...filters, mediaKinds })}
      />
      <FacetMenu
        label="Style"
        options={facets.styles}
        selected={filters.styles}
        onChange={(values) => onFiltersChange({ ...filters, styles: values })}
      />
      <FacetMenu
        label="Tag"
        options={facets.tags}
        selected={filters.tags}
        onChange={(values) => onFiltersChange({ ...filters, tags: values })}
      />
      <FacetMenu
        label="Colour"
        options={facets.colours}
        selected={filters.colours}
        onChange={(values) => onFiltersChange({ ...filters, colours: values })}
      />
      <FacetMenu
        label="Source"
        options={facets.sourceKinds}
        selected={filters.sourceKinds}
        onChange={(values) => onFiltersChange({ ...filters, sourceKinds: values })}
      />

      {active > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onFiltersChange({
              mediaKinds: [],
              styles: [],
              tags: [],
              colours: [],
              sourceKinds: [],
              analysisStatuses: [],
            })
          }
        >
          Clear
        </Button>
      )}

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <ArrowDownUp className="size-3.5" />
              {SORT_LABELS[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABELS) as LibrarySort[]).map((option) => (
              <DropdownMenuCheckboxItem
                key={option}
                checked={sort === option}
                onCheckedChange={() => onSortChange(option)}
              >
                {SORT_LABELS[option]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
