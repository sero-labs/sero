import { Button } from '@sero-ai/ui';
import { Maximize2, Monitor, RotateCw, Smartphone, Tablet } from 'lucide-react';

/**
 * How wide the page is being rendered, and at what scale.
 *
 * A generated design is meant to work at more than one width — the prompt says
 * so — and the only way to see whether it does is to give it that width. The
 * pane is rarely 1280 pixels wide, so a fixed width is scaled down to fit and
 * the percentage is stated: what is on screen is smaller than the page really
 * is, and hiding that would make every design look denser than it is.
 */

export type ViewportId = 'fit' | 'desktop' | 'tablet' | 'mobile';

export interface Viewport {
  id: ViewportId;
  label: string;
  /** CSS pixels the page is rendered at. `undefined` fills the pane. */
  width?: number;
}

export const VIEWPORTS: Viewport[] = [
  { id: 'fit', label: 'Pane width' },
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 834 },
  { id: 'mobile', label: 'Mobile', width: 390 },
];

const TITLES: Record<ViewportId, string> = {
  fit: 'Pane width — the page reflows as the pane changes',
  desktop: 'Desktop — 1280 px',
  tablet: 'Tablet — 834 px',
  mobile: 'Phone — 390 px',
};

const ICONS: Record<ViewportId, React.ComponentType<{ className?: string }>> = {
  fit: Maximize2,
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

export interface PreviewControlsProps {
  viewport: Viewport;
  /** 1 when the page fits; below 1 when it is being scaled down to fit. */
  scale: number;
  /** How wide the pane itself is, which is the width used in `fit`. */
  paneWidth: number;
  onViewport(viewport: Viewport): void;
  onReload(): void;
}

export function PreviewControls({
  viewport,
  scale,
  paneWidth,
  onViewport,
  onReload,
}: PreviewControlsProps) {
  // Always the width the page is actually being rendered at. Naming the mode
  // instead — "fits the pane" — said nothing you could act on.
  const readout =
    viewport.width === undefined
      ? `${Math.round(paneWidth)} px`
      : `${viewport.width} px · ${Math.round(scale * 100)}%`;

  return (
    <div className="border-border flex items-center gap-2 border-t px-2 py-1.5">
      <span className="text-muted-foreground w-28 shrink-0 text-sm tabular-nums">{readout}</span>

      <div className="mx-auto flex items-center gap-1" role="group" aria-label="Preview width">
        {VIEWPORTS.map((entry) => {
          const Icon = ICONS[entry.id];
          return (
            <Button
              key={entry.id}
              type="button"
              variant={entry.id === viewport.id ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={entry.id === viewport.id}
              title={TITLES[entry.id]}
              onClick={() => onViewport(entry)}
            >
              <Icon className="size-3.5" />
              <span className="sr-only">{entry.label}</span>
            </Button>
          );
        })}
      </div>

      <Button type="button" variant="ghost" size="sm" aria-label="Reload preview" onClick={onReload}>
        <RotateCw className="size-3.5" />
      </Button>
    </div>
  );
}
