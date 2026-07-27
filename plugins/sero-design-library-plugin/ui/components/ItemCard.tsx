import { Badge } from '@sero-ai/ui';
import { Check, Clock, ImageOff, Pencil, Star, TriangleAlert } from 'lucide-react';

import type { ItemSummary } from '../../shared/types';
import { useAssetSrc } from '../hooks/useAssetSrc';

/**
 * One card in the uniform grid.
 *
 * Equal-width cards with a fixed-ratio image and consistent metadata
 * alignment, so a wall of references reads as a wall of references rather than
 * a ragged list (spec §5.1).
 *
 * Clicking anywhere on the card selects it, because gathering references for a
 * Design is the thing the grid is for. Opening one is a separate, visible
 * button rather than a double-click — a gesture nothing on screen advertises,
 * and an awkward one to aim at a card that also responds to single clicks.
 */

interface ItemCardProps {
  item: ItemSummary;
  selected: boolean;
  /**
   * Set on the one card taking part in a transition, so its image morphs into
   * the opened reference's image (and back again).
   */
  transitionName?: string;
  onOpen(): void;
  onToggleSelect(): void;
}

function StatusMark({ status }: { status: ItemSummary['analysisStatus'] }) {
  if (status === 'ready') return <span className="bg-primary size-1.5 shrink-0 rounded-full" />;
  if (status === 'failed') {
    return <TriangleAlert className="text-destructive size-3 shrink-0" aria-label="Analysis failed" />;
  }
  return <Clock className="text-muted-foreground size-3 shrink-0" aria-label={`Analysis ${status}`} />;
}

function statusLabel(item: ItemSummary): string {
  switch (item.analysisStatus) {
    case 'ready':
      return item.primaryStyle || 'Analysed';
    case 'running':
      return 'Analysing…';
    case 'failed':
      return item.analysisError ?? 'Analysis failed';
    case 'cancelled':
      return 'Analysis cancelled';
    case 'pending':
      return 'Waiting to analyse';
  }
}

export function ItemCard({ item, selected, transitionName, onOpen, onToggleSelect }: ItemCardProps) {
  const src = useAssetSrc(item.id);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select ${item.title}`}
      onClick={onToggleSelect}
      onKeyDown={(event) => {
        // The card is the selection control, so both keys do the one thing it
        // does. Opening has its own button, with its own focus stop.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleSelect();
        }
      }}
      className={`group border-border bg-card focus-visible:ring-ring relative cursor-pointer overflow-hidden rounded-lg border transition-colors focus-visible:ring-2 focus-visible:outline-none ${
        selected ? 'border-primary' : 'hover:border-muted-foreground/40'
      }`}
    >
      <div className="bg-muted aspect-4/3 w-full overflow-hidden">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-cover"
            {...(transitionName === undefined ? {} : { style: { viewTransitionName: transitionName } })}
          />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center">
            <ImageOff className="size-5" />
          </span>
        )}
      </div>

      <span
        aria-hidden
        className={`absolute top-2 left-2 flex size-5 items-center justify-center rounded border transition-opacity ${
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background/80 text-transparent opacity-0 group-hover:opacity-100'
        }`}
      >
        <Check className="size-3" />
      </span>

      {/* Opening is the one action that needs to survive being drawn over an
          arbitrary image, so it carries its own surface rather than relying on
          the photo behind it being dark enough. */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {item.favourite && (
          <span
            className="bg-background/85 flex size-6 items-center justify-center rounded-md backdrop-blur-sm"
            aria-label="Favourite"
          >
            <Star className="text-primary size-3.5 fill-current" />
          </span>
        )}
        <button
          type="button"
          aria-label={`Open ${item.title}`}
          title="Open"
          onClick={(event) => {
            // Without this the click also lands on the card and toggles
            // selection on the way out.
            event.stopPropagation();
            onOpen();
          }}
          className="bg-background/85 text-foreground hover:bg-background focus-visible:ring-ring flex size-6 items-center justify-center rounded-md backdrop-blur-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      {item.kind === 'video' && (
        <Badge variant="secondary" className="absolute right-2 bottom-2 text-xs">
          Video
        </Badge>
      )}

      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center gap-1.5">
          <StatusMark status={item.analysisStatus} />
          <span className="truncate text-sm font-medium">{item.title}</span>
        </div>
        <div className="text-muted-foreground truncate text-xs" title={statusLabel(item)}>
          {statusLabel(item)}
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
