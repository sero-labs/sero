import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, SearchInput } from '@sero-ai/ui';
import { ArrowDownUp, ChevronDown } from 'lucide-react';

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

type ListFilterKey = 'styles' | 'tags' | 'colours' | 'sourceKinds' | 'mediaKinds';

const SORT_LABELS: Record<LibrarySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'By title',
};

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

interface FacetMenuProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle(value: string): void;
}

function FacetMenu({ label, options, selected, onToggle }: FacetMenuProps) {
  if (options.length === 0) return null;
  // Checked once per option, so membership is a Set lookup.
  const chosen = new Set(selected);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={selected.length > 0 ? 'secondary' : 'outline'} size="sm">
          {label}
          {selected.length > 0 && <span className="tabular-nums">{selected.length}</span>}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      {/* No heading inside: the trigger already says which facet this is. */}
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={chosen.has(option)}
            onCheckedChange={() => onToggle(option)}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const toggleIn = (key: ListFilterKey, value: string) =>
    onFiltersChange({ ...filters, [key]: toggle(filters[key] as string[], value) });

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
        options={['image', 'video']}
        selected={filters.mediaKinds}
        onToggle={(value) => toggleIn('mediaKinds', value)}
      />
      <FacetMenu
        label="Style"
        options={facets.styles}
        selected={filters.styles}
        onToggle={(value) => toggleIn('styles', value)}
      />
      <FacetMenu
        label="Tag"
        options={facets.tags}
        selected={filters.tags}
        onToggle={(value) => toggleIn('tags', value)}
      />
      <FacetMenu
        label="Colour"
        options={facets.colours}
        selected={filters.colours}
        onToggle={(value) => toggleIn('colours', value)}
      />
      <FacetMenu
        label="Source"
        options={facets.sourceKinds}
        selected={filters.sourceKinds}
        onToggle={(value) => toggleIn('sourceKinds', value)}
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
