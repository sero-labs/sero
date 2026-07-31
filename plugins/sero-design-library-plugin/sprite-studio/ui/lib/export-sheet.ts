/**
 * What the export screen shows before anything is written (D16, spec §7).
 *
 * The runtime writes the two files; this works out the same geometry so the
 * screen can state the real cell size, the real sheet size and the atlas the
 * layout will produce. It is arithmetic over canvases and durations, so it is
 * the same answer rather than an impression of one.
 *
 * The scale is a whole number or the pixels blur (D3). A request that does not
 * divide cleanly is resolved to the nearest one here, and the real size is
 * stated rather than being produced quietly by a fractional scale.
 */

import type { LoopMode } from '../../shared/character';
import type { SpriteExportOptions } from '../../shared/state';

export const MAX_EXPORT_SCALE = 12;

export interface ResolvedScale {
  scale: number;
  width: number;
  height: number;
  /** True when the height asked for was not a whole multiple of the artwork. */
  adjusted: boolean;
}

/** The nearest whole scale to a wanted pixel height, and what it really gives. */
export function resolveScale(
  artWidth: number,
  artHeight: number,
  wantedHeight: number,
): ResolvedScale {
  const exact = artHeight > 0 ? wantedHeight / artHeight : 1;
  const scale = Math.min(MAX_EXPORT_SCALE, Math.max(1, Math.round(exact)));
  return {
    scale,
    width: artWidth * scale,
    height: artHeight * scale,
    adjusted: artHeight * scale !== Math.round(wantedHeight),
  };
}

/** An atlas tag name: lower case, one underscore where the words were. */
export function tagName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug === '' ? 'animation' : slug;
}

export interface SheetAnimation {
  id: string;
  name: string;
  loop: LoopMode;
  canvas: { cols: number; rows: number };
  /** The character's root within this animation's canvas, in art pixels. */
  anchor: { col: number; row: number };
  /** One entry per frame, each the real time it held (D23). */
  durationsMs: number[];
}

export interface SheetCharacter {
  id: string;
  artHeight: number;
  palette: string[];
}

export interface AtlasFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

export interface AtlasTag {
  name: string;
  from: number;
  to: number;
  direction: LoopMode;
}

export interface Atlas {
  frames: AtlasFrame[];
  meta: {
    app: string;
    size: { w: number; h: number };
    scale: string;
    frameTags: AtlasTag[];
    sero: {
      character: string;
      artHeight: number;
      anchor: { x: number; y: number };
      palette: string[];
    };
  };
}

export interface Sheet {
  atlas: Atlas;
  /** The cell every animation is padded to, or the largest one in use. */
  cell: { width: number; height: number };
  frameCount: number;
}

function cellOf(
  animation: SheetAnimation,
  largest: { cols: number; rows: number },
  uniform: boolean,
): { cols: number; rows: number } {
  return uniform ? largest : animation.canvas;
}

/**
 * The sheet and its atlas.
 *
 * `trim` is passed through rather than modelled: what a frame trims to is a
 * property of its pixels, which this side has not read. The sizes here are
 * therefore the untrimmed ones, which is what the layout reserves.
 */
export function buildSheet(
  character: SheetCharacter,
  animations: SheetAnimation[],
  options: SpriteExportOptions,
): Sheet {
  const scale = Math.max(1, Math.round(options.scale));
  const largest = animations.reduce(
    (widest, animation) => ({
      cols: Math.max(widest.cols, animation.canvas.cols),
      rows: Math.max(widest.rows, animation.canvas.rows),
    }),
    { cols: 0, rows: 0 },
  );

  const frames: AtlasFrame[] = [];
  const frameTags: AtlasTag[] = [];
  let sheetWidth = 0;
  let sheetHeight = 0;
  let rowY = 0;
  let runX = 0;

  for (const animation of animations) {
    const cell = cellOf(animation, largest, options.uniformCell);
    const width = cell.cols * scale;
    const height = cell.rows * scale;
    const tag = tagName(animation.name);
    const from = frames.length;

    for (const [index, durationMs] of animation.durationsMs.entries()) {
      const x = options.layout === 'rows' ? index * width : runX;
      const y = options.layout === 'rows' ? rowY : 0;
      frames.push({
        filename: `${tag} ${index}`,
        frame: { x, y, w: width, h: height },
        duration: Math.max(1, Math.round(durationMs)),
      });
      if (options.layout === 'single-row') runX += width;
      sheetWidth = Math.max(sheetWidth, x + width);
      sheetHeight = Math.max(sheetHeight, y + height);
    }

    if (animation.durationsMs.length > 0) {
      frameTags.push({ name: tag, from, to: frames.length - 1, direction: animation.loop });
    }
    if (options.layout === 'rows') rowY += height;
  }

  // One anchor, as the atlas carries it. It is the first included animation's,
  // which is every animation's once the cells are uniform — and a game reading
  // a ragged sheet has the per-cell size to work from anyway.
  const first = animations[0];
  const anchor = first
    ? { x: first.anchor.col * scale, y: first.anchor.row * scale }
    : { x: 0, y: 0 };

  return {
    atlas: {
      frames,
      meta: {
        app: 'sero-sprite-studio',
        size: { w: sheetWidth, h: sheetHeight },
        scale: String(scale),
        frameTags,
        sero: {
          character: character.id,
          artHeight: character.artHeight,
          anchor,
          palette: character.palette,
        },
      },
    },
    cell: { width: largest.cols * scale, height: largest.rows * scale },
    frameCount: frames.length,
  };
}

export const DEFAULT_EXPORT_OPTIONS: SpriteExportOptions = {
  scale: 4,
  layout: 'rows',
  // Off by default: it wastes space on every idle frame, and only an engine
  // that wants a uniform grid needs it (D19).
  uniformCell: false,
  trim: false,
  destination: { kind: 'downloads' },
};
