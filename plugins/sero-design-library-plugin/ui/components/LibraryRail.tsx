import { Button, Input, ScrollArea } from '@sero-ai/ui';
import { Clock, Diamond, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Collection } from '../../shared/records';
import { deriveStyleGroups, matchesScope } from '../../shared/search';
import type { ItemSummary, LibraryScope } from '../../shared/types';

/**
 * The left rail: fixed scopes, then the user's own collections, then style
 * groups derived from the Librarian's `primaryStyle` values.
 *
 * Style groups are not a separate concept to maintain — they are what the
 * Librarian already said, counted. Nothing here needs embeddings or an extra
 * model call.
 */

interface LibraryRailProps {
  items: ItemSummary[];
  collections: Collection[];
  scope: LibraryScope;
  onScopeChange(scope: LibraryScope): void;
  onCreateCollection(name: string): void;
}

function sameScope(a: LibraryScope, b: LibraryScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'collection' && b.kind === 'collection') return a.collectionId === b.collectionId;
  if (a.kind === 'style' && b.kind === 'style') return a.style === b.style;
  return true;
}

interface RailRowProps {
  active: boolean;
  label: string;
  count: number;
  icon?: React.ReactNode;
  onClick(): void;
}

function RailRow({ active, label, count, icon, onClick }: RailRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
    </button>
  );
}

function RailHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center justify-between px-2 pt-4 pb-1 text-xs font-medium tracking-wide uppercase">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function LibraryRail({
  items,
  collections,
  scope,
  onScopeChange,
  onCreateCollection,
}: LibraryRailProps) {
  const [newCollection, setNewCollection] = useState<string | null>(null);

  const countFor = useMemo(() => {
    const now = Date.now();
    return (candidate: LibraryScope) =>
      items.filter((item) => matchesScope(item, candidate, now)).length;
  }, [items]);

  const styleGroups = useMemo(() => deriveStyleGroups(items), [items]);

  const submitCollection = () => {
    const name = newCollection?.trim() ?? '';
    if (name !== '') onCreateCollection(name);
    setNewCollection(null);
  };

  return (
    <ScrollArea className="border-border h-full w-56 shrink-0 border-r">
      <nav className="p-2" aria-label="Library navigation">
        <RailHeading>Library</RailHeading>
        <RailRow
          active={sameScope(scope, { kind: 'all' })}
          label="All inspiration"
          count={countFor({ kind: 'all' })}
          icon={<Diamond className="size-3.5" />}
          onClick={() => onScopeChange({ kind: 'all' })}
        />
        <RailRow
          active={sameScope(scope, { kind: 'favourites' })}
          label="Favourites"
          count={countFor({ kind: 'favourites' })}
          icon={<Star className="size-3.5" />}
          onClick={() => onScopeChange({ kind: 'favourites' })}
        />
        <RailRow
          active={sameScope(scope, { kind: 'awaiting' })}
          label="Awaiting analysis"
          count={countFor({ kind: 'awaiting' })}
          icon={<Clock className="size-3.5" />}
          onClick={() => onScopeChange({ kind: 'awaiting' })}
        />
        <RailRow
          active={sameScope(scope, { kind: 'recent' })}
          label="Recently added"
          count={countFor({ kind: 'recent' })}
          icon={<Sparkles className="size-3.5" />}
          onClick={() => onScopeChange({ kind: 'recent' })}
        />

        <RailHeading
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5"
              aria-label="New collection"
              onClick={() => setNewCollection('')}
            >
              <Plus className="size-3.5" />
            </Button>
          }
        >
          Collections
        </RailHeading>
        {newCollection !== null && (
          <Input
            autoFocus
            value={newCollection}
            placeholder="Collection name"
            className="mb-1 h-7 text-sm"
            onChange={(event) => setNewCollection(event.target.value)}
            onBlur={submitCollection}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCollection();
              if (event.key === 'Escape') setNewCollection(null);
            }}
          />
        )}
        {collections.map((collection) => (
          <RailRow
            key={collection.id}
            active={sameScope(scope, { kind: 'collection', collectionId: collection.id })}
            label={collection.name}
            count={countFor({ kind: 'collection', collectionId: collection.id })}
            icon={<span className="bg-primary size-2 rounded-full" />}
            onClick={() => onScopeChange({ kind: 'collection', collectionId: collection.id })}
          />
        ))}

        {styleGroups.length > 0 && (
          <>
            <RailHeading>Style groups</RailHeading>
            {styleGroups.map((group) => (
              <RailRow
                key={group.style}
                active={sameScope(scope, { kind: 'style', style: group.style })}
                label={group.style}
                count={group.count}
                icon={<Sparkles className="size-3.5" />}
                onClick={() => onScopeChange({ kind: 'style', style: group.style })}
              />
            ))}
          </>
        )}

        <RailHeading>&nbsp;</RailHeading>
        <RailRow
          active={sameScope(scope, { kind: 'trash' })}
          label="Trash"
          count={countFor({ kind: 'trash' })}
          icon={<Trash2 className="size-3.5" />}
          onClick={() => onScopeChange({ kind: 'trash' })}
        />
      </nav>
    </ScrollArea>
  );
}
