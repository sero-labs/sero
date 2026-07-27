import { Badge, cn } from '@sero-ai/ui';
import { Check, ImageOff } from 'lucide-react';
import type { LibraryItemSummary } from '../../shared/types';
import { useItemImage, type ImageLoader } from '../hooks/useItemImage';

export interface LibraryCardProps {
  item: LibraryItemSummary;
  selectionOrder: number | null;
  loadImage: ImageLoader;
  onToggleSelection: (itemId: string) => void;
  onOpen: (itemId: string) => void;
}

/**
 * The style line doubles as the analysis state, so the card never says the
 * same thing twice.
 */
function styleLine(item: LibraryItemSummary): string {
  if (item.analysisStatus === 'ready') return item.primaryStyle || 'Unclassified';
  if (item.analysisStatus === 'analysing') return 'Analysing…';
  if (item.analysisStatus === 'failed') return 'Analysis needs attention';
  return 'Waiting for the Librarian';
}

export function LibraryCard({
  item,
  selectionOrder,
  loadImage,
  onToggleSelection,
  onOpen,
}: LibraryCardProps) {
  const preview = useItemImage(item.id, loadImage);
  const selected = selectionOrder !== null;

  return (
    <article
      className={cn(
        'dl-library-card',
        selected && 'dl-library-card--selected',
        item.deletedAt !== undefined && 'dl-library-card--deleted',
      )}
    >
      <button
        aria-label={`Open ${item.title}`}
        className="dl-library-card__shot"
        onClick={() => onOpen(item.id)}
        type="button"
      >
        {preview
          ? <img alt="" className="dl-library-card__image" src={preview} />
          : <span className="dl-library-card__placeholder"><ImageOff aria-hidden="true" size={20} /></span>}
      </button>

      <button
        aria-label={selected ? `Remove ${item.title} from the selection` : `Add ${item.title} to the selection`}
        aria-pressed={selected}
        className="dl-library-card__select"
        onClick={() => onToggleSelection(item.id)}
        type="button"
      >
        {selected
          ? <span className="dl-library-card__order">{selectionOrder + 1}</span>
          : <Check aria-hidden="true" size={12} />}
      </button>

      <div className="dl-library-card__copy">
        <div className="dl-library-card__title">
          <span className={cn('dl-dot', `dl-dot--${item.analysisStatus}`)} />
          <strong>{item.title}</strong>
        </div>
        <span>{styleLine(item)}</span>

        {item.tags.length > 0 ? (
          <div className="dl-tag-row">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
