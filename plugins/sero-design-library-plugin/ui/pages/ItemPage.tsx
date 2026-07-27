import { Button } from '@sero-ai/ui';
import { ChevronRight, ImageOff } from 'lucide-react';

import type { Collection } from '../../shared/records';
import type { ItemSummary } from '../../shared/types';
import { ItemInspector } from '../components/ItemInspector';
import { useAssetSrc } from '../hooks/useAssetSrc';
import { useItemDetail } from '../hooks/useItemDetail';
import type { LibraryActions } from '../hooks/useLibrary';
import { REFERENCE_TRANSITION_NAME } from '../lib/view-transition';

/**
 * One reference, on its own surface.
 *
 * The prototype gives an opened reference the whole window rather than a panel
 * beside the grid: the image gets real size on the left, the Librarian's
 * reading sits to the right. At grid width neither of those has room, which is
 * why opening is a navigation rather than a side panel.
 */

interface ItemPageProps {
  item: ItemSummary;
  collections: Collection[];
  revision: number;
  actions: LibraryActions;
  onBack(): void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function formatDate(timestamp: number): string {
  if (timestamp <= 0) return '';
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ItemPage({ item, collections, revision, actions, onBack }: ItemPageProps) {
  const detail = useItemDetail(item.id, revision);
  const src = useAssetSrc(item.id, 'original');

  // The first collection the reference belongs to, purely as a breadcrumb hint.
  const memberOf = new Set(item.collectionIds);
  const collection = collections.find((entry) => memberOf.has(entry.id));

  const facts = [
    detail?.fileName,
    detail && detail.width > 0 ? `${detail.width} × ${detail.height}` : '',
    detail ? formatBytes(detail.bytes) : '',
    detail ? formatDate(detail.createdAt) : '',
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <nav
          aria-label="Breadcrumb"
          className="text-muted-foreground flex items-center gap-1 px-4 py-2.5 text-sm"
        >
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onBack}>
            Library
          </Button>
          {collection && (
            <>
              <ChevronRight className="size-3.5" />
              <span>{collection.name}</span>
            </>
          )}
          <ChevronRight className="size-3.5" />
          <span className="text-foreground truncate font-medium">{item.title}</span>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="bg-muted border-border flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border">
            {src ? (
              <img
                src={src}
                alt={item.title}
                className="max-h-full max-w-full object-contain"
                // The other half of the morph: the card's image carries this
                // same name on the grid side.
                style={{ viewTransitionName: REFERENCE_TRANSITION_NAME }}
              />
            ) : (
              <span className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
                <ImageOff className="size-6" />
                Loading image…
              </span>
            )}
          </div>
          {facts.length > 0 && (
            <p className="text-muted-foreground mt-2 truncate text-xs">{facts.join(' · ')}</p>
          )}
        </div>
      </div>

      <ItemInspector item={item} revision={revision} actions={actions} onClose={onBack} />
    </div>
  );
}
