import type { CSSProperties } from 'react';

import { useSpriteAsset } from '../hooks/useSpriteAsset';

/**
 * A stored sprite, drawn as pixels.
 *
 * Whole-number scales and nearest-neighbour only. Anything else blurs the
 * artwork the whole pipeline exists to recover, and a sprite shown blurred is a
 * sprite the user cannot judge (D3).
 */

/** Transparency, shown rather than implied. */
export const CHECKER_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,var(--muted) 25%,transparent 25%),linear-gradient(-45deg,var(--muted) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--muted) 75%),linear-gradient(-45deg,transparent 75%,var(--muted) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

interface SpritePixelsProps {
  /** Relative to the app state directory, as every record stores it. */
  path: string | undefined;
  /**
   * The owning record's `updatedAt`. A hand edit and a re-quantise both rewrite
   * a file in place, so without this the cached picture would outlive it.
   */
  version?: number;
  /** The artwork's size in art pixels. */
  cols: number;
  rows: number;
  scale: number;
  alt: string;
  /**
   * Shrink to the box instead of taking a whole-number scale. Only for the
   * source file the character was measured from, which is far too big to show
   * at 1× and is not the artwork anyway.
   */
  fit?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function SpritePixels({
  path,
  version,
  cols,
  rows,
  scale,
  alt,
  fit = false,
  className,
  style,
}: SpritePixelsProps) {
  const src = useSpriteAsset(path, version);
  // Taken out of the flow to be shrunk.
  //
  // `max-height: 100%` alone does nothing here, and it looks like it should:
  // the box the picture sits in is a content-sized grid area, so its height
  // depends on the picture and the picture's height would depend on the box.
  // The browser resolves that circle by ignoring the percentage, and a tall
  // reference — 496 × 1088 — then rendered at 1060 in a 646 box and had its
  // legs cut off. Positioning against the box gives the percentage something
  // definite to be a percentage of.
  const size = fit
    ? ({
        position: 'absolute',
        inset: 0,
        margin: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
      } as const)
    : { width: cols * scale, height: rows * scale };

  // The box is held at full size before the bytes arrive, so a strip does not
  // reflow as ten frames land one after another.
  if (src === null) {
    return <span className={className} style={{ ...size, ...style }} aria-hidden />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ ...size, imageRendering: 'pixelated', ...style }}
      draggable={false}
    />
  );
}

/** The largest whole scale that fits the artwork into a box. */
export function fitScale(cols: number, rows: number, boxWidth: number, boxHeight: number): number {
  if (cols <= 0 || rows <= 0) return 1;
  return Math.max(1, Math.floor(Math.min(boxWidth / cols, boxHeight / rows)));
}
