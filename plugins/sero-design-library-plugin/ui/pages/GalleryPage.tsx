import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { SearchInput } from '@sero-ai/ui/components/ui/search-input';
import { Clock, Heart, Images, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { GalleryFamilyRecord } from '../../shared/gallery';
import type { GalleryActions } from '../hooks/useGallery';
import { GalleryCard } from '../components/gallery/GalleryCard';
import { GalleryTrash } from '../components/gallery/GalleryTrash';
import { NavigationRailHeading, NavigationRailRow } from '../components/NavigationRail';

interface GalleryPageProps {
  families: GalleryFamilyRecord[];
  trash: GalleryFamilyRecord[];
  actions: GalleryActions;
  onOpened(): void;
  onRemix(familyId: string, versionId: string): void;
  error?: string;
}

type GalleryScope = 'all' | 'favourites' | 'recent' | 'trash';

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

function trashEntryCount(families: GalleryFamilyRecord[]): number {
  return families.reduce(
    (total, family) =>
      total +
      (family.deletedAt === undefined
        ? family.versions.filter((version) => version.deletedAt !== undefined).length
        : 1),
    0,
  );
}

export function GalleryPage({
  families,
  trash,
  actions,
  onOpened,
  onRemix,
  error,
}: GalleryPageProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<GalleryScope>('all');
  const recent = useMemo(() => {
    const now = Date.now();
    return families.filter((family) => now - family.updatedAt < RECENT_MS);
  }, [families]);
  const counts = useMemo(() => {
    return {
      all: families.length,
      favourites: families.filter((family) => family.favourite).length,
      recent: recent.length,
      trash: trashEntryCount(trash),
    };
  }, [families, recent, trash]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped =
      scope === 'favourites'
        ? families.filter((family) => family.favourite)
        : scope === 'recent'
          ? recent
          : families;
    return needle === ''
      ? scoped
      : scoped.filter((family) => family.title.toLowerCase().includes(needle));
  }, [families, query, recent, scope]);
  return (
    <div className="flex min-h-0 flex-1">
      <ScrollArea className="border-border h-full w-56 shrink-0 border-r">
        <nav className="p-2" aria-label="Gallery navigation">
          <NavigationRailHeading>Gallery</NavigationRailHeading>
          <NavigationRailRow
            active={scope === 'all'}
            label="All designs"
            count={counts.all}
            icon={<Images className="size-3.5" />}
            onClick={() => setScope('all')}
          />
          <NavigationRailRow
            active={scope === 'favourites'}
            label="Favourites"
            count={counts.favourites}
            icon={<Heart className="size-3.5" />}
            onClick={() => setScope('favourites')}
          />
          <NavigationRailRow
            active={scope === 'recent'}
            label="Recently saved"
            count={counts.recent}
            icon={<Clock className="size-3.5" />}
            onClick={() => setScope('recent')}
          />
          <NavigationRailHeading>&nbsp;</NavigationRailHeading>
          <NavigationRailRow
            active={scope === 'trash'}
            label="Trash"
            count={counts.trash}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => setScope('trash')}
          />
        </nav>
      </ScrollArea>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved designs"
            aria-label="Search Gallery"
            className="h-8 max-w-96 min-w-56 flex-1"
          />
        </div>
        {error && (
          <p className="text-destructive border-border border-b px-5 py-2 text-sm" role="alert">
            {error}
          </p>
        )}
        <ScrollArea className="min-h-0 flex-1">
          {scope === 'trash' ? (
            <GalleryTrash families={trash} query={query} actions={actions} />
          ) : visible.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-3 px-6 py-24 text-center text-sm">
              <Images className="size-8" />
              <p>
                {families.length === 0
                  ? 'Save a Design when it is worth keeping.'
                  : 'No saved Design matches.'}
              </p>
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
                  onExport={(versionId, destination) => {
                    void actions.exportVersion(family.id, versionId, destination);
                  }}
                  onFavourite={(favourite) => void actions.favourite(family.id, favourite)}
                  onDelete={() => void actions.removeFamily(family.id)}
                  onDeleteVersion={(versionId) =>
                    void actions.removeVersion(family.id, versionId)
                  }
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
