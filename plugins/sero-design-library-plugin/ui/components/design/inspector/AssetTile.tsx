import { AlertTriangle, Film, Loader2 } from 'lucide-react';

import type { AssetView } from '../../../lib/asset-view';
import { useDesignAssetSrc } from '../../../hooks/useAssetSrc';

/**
 * One asset in the tray.
 *
 * A tile is always present once an asset is reserved, whatever happened to it:
 * "provider unavailability yields a local placeholder with asset-only retry"
 * only works if the failure has somewhere to live. So the four states share one
 * frame and differ in what fills it.
 */

export interface AssetTileProps {
  designId: string;
  view: AssetView;
  selected: boolean;
  onSelect(): void;
}

export function AssetTile({ designId, view, selected, onSelect }: AssetTileProps) {
  // A video paints its poster; asking for the clip would decode video to draw a
  // thumbnail. Until the frame exists there is nothing to paint, and the tile
  // says so rather than showing a broken image.
  const src = useDesignAssetSrc(
    designId,
    view.state === 'ready' || view.state === 'awaiting-frames' ? view.id : undefined,
    view.attempt?.id,
    view.kind === 'video' ? 'poster' : 'media',
  );

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${view.prompt || view.reference} — ${view.status}`}
        className={`border-border relative block aspect-4/3 w-full overflow-hidden rounded-md border transition-colors ${
          selected ? 'ring-primary ring-2 ring-offset-1' : 'hover:border-muted-foreground/40'
        } ${view.state === 'failed' ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'}`}
      >
        {src === null ? <TilePlaceholder view={view} /> : (
          <img src={src} alt="" className="size-full object-cover" />
        )}

        {view.kind === 'video' && (
          <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 py-px">
            <Film className="size-3 text-white" aria-label="Video" />
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * What a tile shows before there is artwork.
 *
 * The three cases look different on purpose. A spinner that never stops is the
 * failure mode this is written against: an interrupted asset gets a warning and
 * a retry, not the same spinner as one that is genuinely running.
 */
function TilePlaceholder({ view }: { view: AssetView }) {
  if (view.state === 'generating') {
    return (
      <span className="text-muted-foreground grid size-full place-items-center">
        {/* `motion-reduce` rather than a media query in JS: the frame is CSS and
            the preference belongs to the platform. */}
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      </span>
    );
  }

  if (view.state === 'failed' || view.state === 'interrupted') {
    return (
      <span className="text-destructive grid size-full place-items-center">
        <AlertTriangle className="size-4" aria-hidden />
      </span>
    );
  }

  return (
    <span className="text-muted-foreground grid size-full place-items-center text-xs">
      {view.state === 'awaiting-frames' ? <Film className="size-4" aria-hidden /> : null}
    </span>
  );
}
