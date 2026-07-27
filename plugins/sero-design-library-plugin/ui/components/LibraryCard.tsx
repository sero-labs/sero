import { Badge, cn } from '@sero-ai/ui';
import { AlertTriangle, Check, ImageOff, LoaderCircle } from 'lucide-react';
import type { LibraryItemSummary } from '../../shared/types';
import { useItemImage, type ImageLoader } from '../hooks/useItemImage';

export interface LibraryCardProps {
  item: LibraryItemSummary;
  selectionOrder: number | null;
  loadImage: ImageLoader;
  onToggleSelection: (itemId: string) => void;
  onOpen: (itemId: string) => void;
}

const STATUS_LABELS: Record<LibraryItemSummary['analysisStatus'], string> = {
  queued: 'Waiting for the Librarian',
  analysing: 'Librarian analysing',
  ready: 'Analysed',
  failed: 'Analysis needs attention',
};

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
          : <span className="dl-library-card__placeholder"><ImageOff aria-hidden="true" size={18} /></span>}
      </button>

      <button
        aria-label={selected ? `Remove ${item.title} from the selection` : `Add ${item.title} to the selection`}
        aria-pressed={selected}
        className="dl-library-card__select"
        onClick={() => onToggleSelection(item.id)}
        type="button"
      >
        <Check aria-hidden="true" size={13} />
      </button>

      {selected ? <span className="dl-library-card__order">{selectionOrder + 1}</span> : null}

      <div className="dl-library-card__copy">
        <div className="dl-library-card__title">
          <span className={cn('dl-dot', `dl-dot--${item.analysisStatus}`)} />
          <strong>{item.title}</strong>
        </div>
        <span>{item.primaryStyle || 'Awaiting analysis'}</span>

        <div className="dl-tag-row">
          {item.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>

        <p className="dl-library-card__status">
          {item.analysisStatus === 'analysing'
            ? <LoaderCircle aria-hidden="true" className="dl-spin" size={12} />
            : null}
          {item.analysisStatus === 'failed'
            ? <AlertTriangle aria-hidden="true" size={12} />
            : null}
          {STATUS_LABELS[item.analysisStatus]}
        </p>
      </div>
    </article>
  );
}
