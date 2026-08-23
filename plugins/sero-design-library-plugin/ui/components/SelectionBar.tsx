import { Button } from '@sero-ai/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@sero-ai/ui/components/ui/dropdown-menu';
import { FolderPlus, RotateCw, Shuffle, Sparkles, Star, Trash2, X } from 'lucide-react';

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
  onCollect(collectionId: string, member: boolean): void;
  onReanalyse(): void;
  onDelete(): void;
  onRestore(): void;
  onPurge(): void;
  onCreateDesign(): void;
  /** Generate new work from the one selected reference (E3). */
  onRemix(): void;
}

function collectionChecked(members: number, selected: number): boolean | 'indeterminate' {
  if (members === 0) return false;
  if (members === selected) return true;
  return 'indeterminate';
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
  onRemix,
}: SelectionBarProps) {
  if (selected.length === 0) return null;
  const count = `${selected.length} reference${selected.length === 1 ? '' : 's'} selected`;
  const collectionMembers = new Map<string, number>();
  for (const item of selected) {
    for (const collectionId of item.collectionIds) {
      collectionMembers.set(collectionId, (collectionMembers.get(collectionId) ?? 0) + 1);
    }
  }

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
            {/* One reference only: a variation is made *from* something, and
                "restyle these four" has no single source to work from. */}
            {selected.length === 1 && selected[0]?.kind === 'image' && (
              <Button type="button" variant="ghost" size="sm" onClick={onRemix}>
                <Shuffle className="size-3.5" />
                Remix
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onFavourite}>
              <Star className="size-3.5" />
              Favourite
            </Button>
            {collections.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    <FolderPlus className="size-3.5" />
                    Collections
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {collections.map((collection) => {
                    const members = collectionMembers.get(collection.id) ?? 0;
                    const checked = collectionChecked(members, selected.length);
                    return (
                      <DropdownMenuCheckboxItem
                        key={collection.id}
                        className="pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
                        checked={checked}
                        onCheckedChange={(next) => onCollect(collection.id, next === true)}
                      >
                        {collection.name}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
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
