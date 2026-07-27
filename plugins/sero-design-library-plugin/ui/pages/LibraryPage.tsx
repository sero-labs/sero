/**
 * Library — a uniform grid of analysed inspiration.
 *
 * File picker, drag-and-drop and clipboard paste all call the same import
 * action, which is the one bounded ingestion pipeline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Label,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { ImagePlus } from 'lucide-react';
import { MAX_DESIGN_REFERENCES } from '../../shared/defaults';
import { collectFacets, filterLibraryItems } from '../../shared/search';
import type { LibraryFilters } from '../../shared/state';
import type { AnalysisStatus, LibraryItemSummary } from '../../shared/types';
import { LibraryCard } from '../components/LibraryCard';
import { ItemInspector, type ResolvedItem } from '../components/ItemInspector';
import { SurfaceState } from '../components/SurfaceState';
import type { DesignLibraryActions } from '../runtime';

export interface LibraryPageProps {
  items: LibraryItemSummary[];
  search: string;
  filters: LibraryFilters;
  selection: string[];
  activeItemId?: string;
  actions: DesignLibraryActions;
  onSearch: (value: string) => void;
  onFilters: (filters: LibraryFilters) => void;
  onToggleSelection: (itemId: string) => void;
  onOpenItem: (itemId: string | undefined) => void;
  onCreateDesign: () => void;
}

const STATUSES: AnalysisStatus[] = ['queued', 'analysing', 'ready', 'failed'];

export function LibraryPage(props: LibraryPageProps) {
  const { items, search, filters, selection, actions } = props;
  const visible = filterLibraryItems(items, search, filters);
  const facets = collectFacets(items);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [inspected, setInspected] = useState<ResolvedItem | null>(null);

  const loadImage = useCallback(
    (params: Record<string, unknown>) => actions.call('design_library_assets', params),
    [actions],
  );

  const openItem = props.onOpenItem;
  const importFiles = useCallback(
    async (files: FileList | File[], source: 'file-picker' | 'drag-drop' | 'clipboard') => {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const result = await actions.importImage(file, source);
        setImportMessage(result.message);
        if (result.duplicate && result.itemId) openItem(result.itemId);
      }
    },
    [actions, openItem],
  );

  // Clipboard paste while the plugin surface has focus.
  useEffect(() => {
    const container = document.querySelector('.dl-app');
    if (!container) return;
    const onPaste = (event: Event) => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      const files = Array.from(clipboard?.files ?? []);
      if (files.length > 0) void importFiles(files, 'clipboard');
    };
    container.addEventListener('paste', onPaste);
    return () => container.removeEventListener('paste', onPaste);
  }, [importFiles]);

  // The inspected item's full record is resolved on demand, never held in state.
  const activeItemId = props.activeItemId;
  useEffect(() => {
    if (!activeItemId) {
      setInspected(null);
      return;
    }
    let active = true;
    void actions.getItem(activeItemId).then((result) => {
      const item = result.details?.item as ResolvedItem | undefined;
      if (active) setInspected(item ?? null);
    });
    return () => {
      active = false;
    };
  }, [activeItemId, actions, items]);

  const deleted = items.find((item) => item.id === activeItemId)?.deletedAt !== undefined;

  return (
    <div
      className="dl-page"
      onDragLeave={() => setDropping(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        void importFiles(event.dataTransfer.files, 'drag-drop');
      }}
    >
      <div className="dl-main">
        <div className="dl-canvas-toolbar">
          <SearchInput
            aria-label="Search inspiration"
            containerClassName="dl-search"
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="Search titles, tags, notes and analysis"
            value={search}
          />

          <FacetSelect
            label="Tag"
            onChange={(value) => props.onFilters({ ...filters, tags: value ? [value] : [] })}
            options={facets.tags}
            value={filters.tags[0] ?? ''}
          />
          <FacetSelect
            label="Colour"
            onChange={(value) => props.onFilters({ ...filters, colours: value ? [value] : [] })}
            options={facets.colours}
            value={filters.colours[0] ?? ''}
          />
          <FacetSelect
            label="Source"
            onChange={(value) => props.onFilters({ ...filters, sources: value ? [value] : [] })}
            options={facets.sources}
            value={filters.sources[0] ?? ''}
          />
          <FacetSelect
            label="Status"
            onChange={(value) =>
              props.onFilters({ ...filters, analysisStatuses: value ? [value as AnalysisStatus] : [] })}
            options={STATUSES}
            value={filters.analysisStatuses[0] ?? ''}
          />

          <div className="dl-filter-toggle">
            <Checkbox
              checked={filters.includeDeleted}
              id="dl-show-deleted"
              onCheckedChange={(checked) =>
                props.onFilters({ ...filters, includeDeleted: checked === true })}
            />
            <Label htmlFor="dl-show-deleted">Deleted</Label>
          </div>

          <div className="dl-canvas-toolbar__right">
            <Button onClick={() => fileInput.current?.click()} size="sm">
              <ImagePlus aria-hidden="true" size={15} />
              Add inspiration
            </Button>
          </div>

          <input
            accept="image/*"
            aria-label="Import images"
            className="dl-visually-hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) void importFiles(event.target.files, 'file-picker');
              event.target.value = '';
            }}
            ref={fileInput}
            type="file"
          />
        </div>

        {importMessage ? <p className="dl-inline-notice">{importMessage}</p> : null}

        {dropping ? (
          <SurfaceState
            detail="Release to import these images into the Library."
            kind="loading"
            title="Drop to import"
          />
        ) : null}

        {items.length === 0 ? (
          <SurfaceState
            detail="Import an image with the button above, drag one in, or paste from the clipboard."
            kind="empty"
            title="Your Library is empty"
          />
        ) : visible.length === 0 ? (
          <SurfaceState
            detail="No inspiration matches this search and filter combination."
            kind="empty"
            title="No inspiration found"
          />
        ) : (
          <div className="dl-library-grid">
            {visible.map((item) => (
              <LibraryCard
                item={item}
                key={item.id}
                loadImage={loadImage}
                onOpen={openItem}
                onToggleSelection={props.onToggleSelection}
                selectionOrder={selection.indexOf(item.id) === -1 ? null : selection.indexOf(item.id)}
              />
            ))}
          </div>
        )}

        {selection.length > 0 ? (
          <div className="dl-selection-bar">
            <span>{selection.length} of {MAX_DESIGN_REFERENCES} references selected · first is Primary</span>
            <Button onClick={props.onCreateDesign} size="sm">Create Design</Button>
          </div>
        ) : null}
      </div>

      {inspected ? (
        <ItemInspector
          deleted={deleted}
          item={inspected}
          onDelete={() => void actions.itemLifecycle(inspected.id, 'soft_delete')}
          onPurge={() => {
            void actions.itemLifecycle(inspected.id, 'purge');
            openItem(undefined);
          }}
          onReanalyse={() => void actions.analyse(inspected.id, 'reanalyse')}
          onResetField={(field) => void actions.resetField(inspected.id, field)}
          onRestore={() => void actions.itemLifecycle(inspected.id, 'restore')}
          onUpdateField={(field, value) => void actions.updateField(inspected.id, field, value)}
        />
      ) : null}
    </div>
  );
}

function FacetSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const ANY = '__any__';

  return (
    <Select
      onValueChange={(next) => onChange(next === ANY ? '' : next)}
      value={value === '' ? ANY : value}
    >
      <SelectTrigger aria-label={label} className="dl-facet" size="sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
