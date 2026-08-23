import { Button } from '@sero-ai/ui/components/ui/button';
import { Progress } from '@sero-ai/ui/components/ui/progress';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { ImagePlus, Sparkles, Upload } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { filesFromClipboard, importableFiles } from '../lib/import';
import { ItemCard } from '../components/ItemCard';
import { LibraryRail } from '../components/LibraryRail';
import { LibraryToolbar } from '../components/LibraryToolbar';
import { PendingItemTile } from '../components/PendingItemTile';
import { pendingGenerations } from '../lib/pending-generations';
import { SelectionBar } from '../components/SelectionBar';
import type { ImportState } from '../hooks/useImport';
import type { ImportSourceKind } from '../lib/import';
import type { ItemSummary } from '../../shared/types';
import type { Library } from '../hooks/useLibrary';

/**
 * The Library surface.
 *
 * File picker, drag-and-drop and clipboard paste all call the same importer,
 * which is why they behave identically — including duplicate handling, which
 * opens the existing reference instead of creating a second one.
 */

interface LibraryPageProps {
  library: Library;
  importState: ImportState;
  importFiles(files: File[], sourceKind: ImportSourceKind): Promise<void>;
  dismissErrors(): void;
  onPickFiles(): void;
  onOpenItem(itemId: string): void;
  /** Ordered as the user picked them, because the first reference leads. */
  onCreateDesign(references: ItemSummary[]): void;
  /** Open the generate dialog, optionally working from a chosen reference. */
  onGenerate(sourceItem?: ItemSummary): void;
  onDismissJob(jobId: string): void;
  /** The card that should carry the transition name, if any. */
  transitioningItemId?: string;
  transitionName: string;
}

const GRID_PAGE_SIZE = 200;

export function LibraryPage({
  library,
  importState,
  importFiles,
  dismissErrors,
  onPickFiles,
  onOpenItem,
  onCreateDesign,
  onGenerate,
  onDismissJob,
  transitioningItemId,
  transitionName,
}: LibraryPageProps) {
  const { state, items, jobs, view, visible, facets, actions } = library;

  const [picked, setPicked] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renderedCount, setRenderedCount] = useState(GRID_PAGE_SIZE);

  const inTrash = view.scope.kind === 'trash';
  // A generation has no item until the provider answers and the bytes take the
  // import route, so the grid would otherwise say nothing had happened — and
  // the obvious thing to do about that is press Generate again and pay twice.
  // Trash is the one scope they do not belong in: nothing there is arriving.
  const pending = useMemo(
    () => (inTrash ? [] : pendingGenerations(jobs)),
    [jobs, inTrash],
  );
  // A Set because both of these are consulted once per card in the grid.
  const pickedIds = useMemo(() => new Set(picked), [picked]);
  // Mapped over `picked` rather than filtered out of `items`: reference
  // order is what makes the first one primary, and the grid's order is not it.
  const pickedItems = useMemo(
    () => picked.flatMap((id) => items.filter((item) => item.id === id)),
    [items, picked],
  );
  const renderedItems = visible.slice(0, renderedCount);

  const togglePicked = useCallback((itemId: string) => {
    setPicked((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }, []);

  const applyToPicked = (apply: (itemId: string) => Promise<void>) => {
    void Promise.all(picked.map(apply)).then(() => setPicked([]));
  };

  return (
    <div
      className="flex min-h-0 flex-1"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void importFiles(importableFiles(event.dataTransfer.files), 'drop');
      }}
      onPaste={(event) => void importFiles(filesFromClipboard(event.clipboardData), 'paste')}
    >
      <LibraryRail
        items={items}
        collections={state.collections}
        scope={view.scope}
        onScopeChange={(scope) => {
          setPicked([]);
          actions.setScope(scope);
        }}
        onCreateCollection={(name) => void actions.createCollection(name, 'primary')}
        onDeleteCollection={(collectionId) => {
          if (view.scope.kind === 'collection' && view.scope.collectionId === collectionId) {
            actions.setScope({ kind: 'all' });
          }
          void actions.deleteCollection(collectionId);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <LibraryToolbar
          query={view.query}
          filters={view.filters}
          facets={facets}
          sort={view.sort}
          onQueryChange={actions.setQuery}
          onFiltersChange={actions.setFilters}
          onSortChange={actions.setSort}
        />

        <SelectionBar
          selected={pickedItems}
          collections={state.collections}
          inTrash={inTrash}
          onClear={() => setPicked([])}
          onFavourite={() => applyToPicked((id) => actions.favourite(id, true))}
          onCollect={(collectionId, member) =>
            applyToPicked((id) => actions.collect(id, collectionId, member))
          }
          onReanalyse={() => applyToPicked((id) => actions.reanalyse(id))}
          onDelete={() => applyToPicked((id) => actions.remove(id))}
          onRestore={() => applyToPicked((id) => actions.restore(id))}
          onPurge={() => applyToPicked((id) => actions.purge(id))}
          onCreateDesign={() => onCreateDesign(pickedItems)}
          onRemix={() => {
            const [first] = pickedItems;
            if (first) onGenerate(first);
          }}
        />

        {importState.active && (
          <div className="border-border space-y-1 border-b px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Upload className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{importState.fileName}</span>
              <span className="text-muted-foreground tabular-nums">
                {importState.done + 1} / {importState.total}
              </span>
            </div>
            <Progress value={importState.progress * 100} className="h-1" />
          </div>
        )}

        {importState.errors.length > 0 && (
          <div className="text-destructive border-border flex items-start gap-2 border-b px-4 py-2 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              {importState.errors.map((error) => (
                <p key={error} className="truncate">
                  {error}
                </p>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={dismissErrors}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {dragging && (
            <div className="border-primary bg-background/85 pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed">
              <p className="text-sm font-medium">Drop images to add them to the Library</p>
            </div>
          )}

          <ScrollArea className="h-full">
            {visible.length === 0 && pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
                <ImagePlus className="text-muted-foreground size-8" />
                <p className="text-muted-foreground text-sm">
                  {items.length === 0
                    ? 'Drop images here, paste from the clipboard, or add a file to start the Library.'
                    : 'Nothing matches the current scope and filters.'}
                </p>
                {items.length === 0 && (
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={onPickFiles}>
                      Add inspiration
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onGenerate()}>
                      <Sparkles className="size-3.5" />
                      Generate one
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-4">
                {/* Ahead of the grid: what is arriving is the thing you are
                    waiting to see, and a tile appended after forty references
                    is one you would have to go looking for. */}
                {pending.map((generation) => (
                  <PendingItemTile
                    key={generation.slotId}
                    generation={generation}
                    onDismiss={onDismissJob}
                  />
                ))}
                {renderedItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selected={pickedIds.has(item.id)}
                    {...(item.id === transitioningItemId ? { transitionName } : {})}
                    onOpen={() => onOpenItem(item.id)}
                    onToggleSelect={() => togglePicked(item.id)}
                    onFavourite={(favourite) => void actions.favourite(item.id, favourite)}
                  />
                ))}
                {renderedItems.length < visible.length && (
                  <div className="col-span-full flex justify-center py-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRenderedCount((count) => count + GRID_PAGE_SIZE)}
                    >
                      Show more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

    </div>
  );
}
