import { Button, Input, ScrollArea } from '@sero-ai/ui';
import { Images } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { GalleryFamilyRecord } from '../../shared/gallery';
import type { GalleryActions } from '../hooks/useGallery';
import { GalleryCard } from '../components/gallery/GalleryCard';
import { GalleryTrash } from '../components/gallery/GalleryTrash';

interface GalleryPageProps {
  families: GalleryFamilyRecord[];
  trash: GalleryFamilyRecord[];
  actions: GalleryActions;
  onOpened(): void;
  onRemix(familyId: string, versionId: string): void;
  error?: string;
}

type GalleryScope = 'all' | 'favourites' | 'recent' | 'trash';

export function GalleryPage({ families, trash, actions, onOpened, onRemix, error }: GalleryPageProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<GalleryScope>('all');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = families.filter((family) => {
      if (scope === 'favourites') return family.favourite;
      if (scope === 'recent') return Date.now() - family.updatedAt < 7 * 24 * 60 * 60 * 1000;
      return true;
    });
    return needle === '' ? scoped : scoped.filter((family) => family.title.toLowerCase().includes(needle));
  }, [families, query, scope]);
  const versionCount = families.reduce(
    (total, family) => total + family.versions.filter((version) => version.deletedAt === undefined).length,
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex items-end gap-4 border-b px-5 py-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Your Gallery</h2>
          <p className="text-muted-foreground mt-1 text-sm">Finished work worth keeping, revisiting, and remixing.</p>
        </div>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {versionCount} version{versionCount === 1 ? '' : 's'} · {families.length} families
        </span>
      </div>
      <div className="border-border border-b px-5 py-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search saved designs"
          aria-label="Search Gallery"
          className="max-w-md"
        />
      </div>
      {error && <p className="text-destructive border-border border-b px-5 py-2 text-sm" role="alert">{error}</p>}
      <div className="flex min-h-0 flex-1">
        <aside className="border-border w-48 shrink-0 space-y-1 border-r p-3">
          <ScopeButton scope="all" current={scope} onSelect={setScope}>All designs</ScopeButton>
          <ScopeButton scope="favourites" current={scope} onSelect={setScope}>Favourites</ScopeButton>
          <ScopeButton scope="recent" current={scope} onSelect={setScope}>Recently saved</ScopeButton>
          <ScopeButton scope="trash" current={scope} onSelect={setScope}>Trash</ScopeButton>
        </aside>
        <ScrollArea className="min-h-0 flex-1">
        {scope === 'trash' ? (
          <GalleryTrash families={trash} actions={actions} />
        ) : visible.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-3 px-6 py-24 text-center text-sm">
            <Images className="size-8" />
            <p>{families.length === 0 ? 'Save a Design when it is worth keeping.' : 'No saved Design matches.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 p-5">
            {visible.map((family) => (
              <GalleryCard
                key={family.id}
                family={family}
                onOpen={(versionId) => {
                  void actions.open(family.id, versionId).then((opened) => {
                    if (opened) onOpened();
                  });
                }}
                onFeature={(versionId) => void actions.feature(family.id, versionId)}
                onDuplicate={(versionId) => {
                  void actions.duplicate(family.id, versionId).then((opened) => {
                    if (opened) onOpened();
                  });
                }}
                onRemix={(versionId) => onRemix(family.id, versionId)}
                onFavourite={(favourite) => void actions.favourite(family.id, favourite)}
                onDelete={() => void actions.removeFamily(family.id)}
                onDeleteVersion={(versionId) => void actions.removeVersion(family.id, versionId)}
              />
            ))}
          </div>
        )}
        </ScrollArea>
      </div>
    </div>
  );
}

function ScopeButton({
  scope,
  current,
  onSelect,
  children,
}: {
  scope: GalleryScope;
  current: GalleryScope;
  onSelect(scope: GalleryScope): void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={scope === current ? 'secondary' : 'ghost'}
      className="w-full justify-start"
      onClick={() => onSelect(scope)}
    >
      {children}
    </Button>
  );
}
