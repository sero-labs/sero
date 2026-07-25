import { cn } from '@sero-ai/ui';
import type { PreviewKind } from '../fixtures';

interface ArtworkPreviewProps {
  kind: PreviewKind;
  compact?: boolean;
  className?: string;
}

export function ArtworkPreview({ kind, compact = false, className }: ArtworkPreviewProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('dl-artwork', `dl-artwork--${kind}`, compact && 'dl-artwork--compact', className)}
    >
      <span className="dl-artwork__eyebrow">SYSTEM / 06</span>
      <span className="dl-artwork__headline">
        {previewTitle(kind)}
      </span>
      <span className="dl-artwork__line dl-artwork__line--one" />
      <span className="dl-artwork__line dl-artwork__line--two" />
      <span className="dl-artwork__panel dl-artwork__panel--one" />
      <span className="dl-artwork__panel dl-artwork__panel--two" />
      <span className="dl-artwork__orb" />
    </div>
  );
}

function previewTitle(kind: PreviewKind): string {
  const titles: Record<PreviewKind, string> = {
    signal: 'CONTROL THE WORK',
    editorial: 'FORM FOLLOWS FEELING',
    glass: 'LAYERED SIGNAL',
    brutal: 'LOUD / ORDER',
    data: 'CLEAR INDEX',
    mobile: 'EVENING FIELD',
    kinetic: 'MOTION / 09',
    luxury: 'ATELIER OBJECT',
  };
  return titles[kind];
}
