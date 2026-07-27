import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@sero-ai/ui';
import { FolderPlus, RotateCw, Sparkles, Star, Trash2, X } from 'lucide-react';

import { MAX_REFERENCES } from '../../shared/design';

import type { Collection } from '../../shared/records';
import type { ItemSummary } from '../../shared/types';

/**
 * The one focused action bar that appears when references are selected.
 *
 * In Trash it offers restore and permanent deletion instead, because those are
 * the only two things that make sense there and a bar full of disabled buttons
 * would say less than a bar with two live ones.
 */

interface SelectionBarProps {
  selected: ItemSummary[];
  collections: Collection[];
  inTrash: boolean;
  onClear(): void;
  onFavourite(): void;
  onCollect(collectionId: string): void;
  onReanalyse(): void;
  onDelete(): void;
  onRestore(): void;
  onPurge(): void;
  onCreateDesign(): void;
}

export function SelectionBar({
  selected,
  collections,
  inTrash,
  onClear,
  onFavourite,
  onCollect,
  onReanalyse,
  onDelete,
  onRestore,
  onPurge,
  onCreateDesign,
}: SelectionBarProps) {
  if (selected.length === 0) return null;
  const count = `${selected.length} reference${selected.length === 1 ? '' : 's'} selected`;

  return (
    <div className="border-border bg-accent/40 flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Clear selection" onClick={onClear}>
        <X className="size-3.5" />
      </Button>
      <span className="text-sm font-medium">{count}</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {inTrash ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onRestore}>
              Restore
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={onPurge}>
              Delete permanently
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              // A Design is generated from the Librarian's reading of a
              // reference, so one without analysis has nothing to contribute and
              // the runtime would refuse the whole Design over it.
              disabled={
                selected.length > MAX_REFERENCES ||
                selected.some((item) => item.analysisStatus !== 'ready')
              }
              onClick={onCreateDesign}
            >
              <Sparkles className="size-3.5" />
              Create design
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onFavourite}>
              <Star className="size-3.5" />
              Favourite
            </Button>
            {collections.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    <FolderPlus className="size-3.5" />
                    Add to collection
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {collections.map((collection) => (
                    <DropdownMenuItem key={collection.id} onSelect={() => onCollect(collection.id)}>
                      {collection.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onReanalyse}>
              <RotateCw className="size-3.5" />
              Reanalyse
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
