import { Button } from '@sero-ai/ui/components/ui/button';
import { RotateCw, Star, Trash2, X } from 'lucide-react';

import type { ItemSummary } from '../../../shared/types';
import { relativeTime } from '../../lib/time';

/**
 * The panel header, as the prototype has it: the Librarian's confidence as a
 * quiet eyebrow, the title at full size, and one line of context underneath.
 *
 * The item actions live here rather than scattered through the panel, so
 * managing a reference never means hunting for the control.
 */

interface InspectorHeaderProps {
  item: ItemSummary;
  confidence: number;
  designTypes: string[];
  updatedAt: number;
  analysing: boolean;
  onFavourite(): void;
  onReanalyse(): void;
  onDelete(): void;
  onClose(): void;
}

export function InspectorHeader({
  item,
  confidence,
  designTypes,
  updatedAt,
  analysing,
  onFavourite,
  onReanalyse,
  onDelete,
  onClose,
}: InspectorHeaderProps) {
  const context = [
    ...designTypes,
    updatedAt > 0 ? `Edited ${relativeTime(updatedAt, Date.now())}` : '',
  ].filter((part) => part !== '');

  return (
    <header className="border-border border-b px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-primary text-xs font-medium tracking-wide uppercase">
            Librarian profile
            {confidence > 0 && ` · ${Math.round(confidence * 100)}% confidence`}
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold">{item.title}</h3>
          {context.length > 0 && (
            <p className="text-muted-foreground mt-0.5 truncate text-sm">{context.join(' · ')}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={item.favourite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={onFavourite}
          >
            <Star className={`size-4 ${item.favourite ? 'text-primary fill-current' : ''}`} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={analysing ? 'Cancel analysis' : 'Reanalyse'}
            title={analysing ? 'Cancel analysis' : 'Reanalyse — fields you edited are kept'}
            onClick={onReanalyse}
          >
            <RotateCw className={`size-4 ${analysing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Move to Trash"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
