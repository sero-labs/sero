/**
 * Standing a reference picture on the character's own canvas.
 *
 * Almost none of the work here is new. Sprite Studio already separates a
 * character from whatever it was drawn on (`floodForeground`,
 * `keepLargestBody`), measures where it stands (`measureSilhouette`), samples
 * source pixels onto a grid (`rawGrid`), reduces a palette properly
 * (`capPalette` in OKLab, weighted by how much of the sprite each colour
 * covers) and groups that palette into material ramps (`buildRamps`). This
 * file is the seam that points those at a reference instead of at a generated
 * plate, and it owns exactly one decision they do not make: **where on the
 * puppet's canvas the figure goes** — scaled to stand at the height the fill
 * gate asks of the author, feet on the character's own ground row, so target
 * and render differ only in what was drawn.
 *
 * The one thing deliberately NOT reused is `recoverArtwork`. It recovers the
 * artwork's true size by finding the grid a picture was enlarged on, and that
 * is the right tool for a reference that arrives clean. Measured on the actual
 * reference — a JPEG of a pixel-art knight — the detector reports block 1 with
 * zero lift: the compression softens every edge, no grid survives, and it
 * falls back to treating 746 x 1068 screen pixels as 746 x 1068 art pixels.
 * A reference is whatever the user had, so the reduction here works from the
 * bounding box instead and never depends on a grid being findable.
 */

import { buildRamps, toHex } from '../../engine/colour';
import { floodForeground, keepLargestBody } from '../../engine/key';
import { measureSilhouette } from '../../engine/measure';
import { capPalette, dedupePalette, remapCells } from '../../engine/palette';
import { quantiseSequence } from '../../engine/quantise';
import { rawGrid } from '../../engine/resample';
import type { CellGrid, Foreground, Palette, Rgb, SourceImage } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';

/** A cell needs this much of it drawn to be part of the figure. Matches the
 * ingestion default: below it, the reduced edge is a halo of half-background. */
const COVERAGE = 0.5;

export interface ReferenceFigure {
  foreground: Foreground;
  /** Where the figure sits in the source picture. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** The lowest SOLID row — a foot line, not the tip of a trailing pixel. */
  footRow: number;
}

/**
 * Find the character in the reference.
 *
 * `floodForeground` is the user-supplied-picture route: it fills inward from
 * the border, so a background-coloured region the drawing encloses survives,
 * and it refuses to walk down a soft gradient into the character — the trap
 * that once took the insides out of a pair of boots. `keepLargestBody` then
 * drops anything detached, which is what a stray watermark or a signature is.
 */
export function findFigure(image: SourceImage): ReferenceFigure | null {
  const kept = keepLargestBody(floodForeground(image), image.width, image.height);
  const measured = measureSilhouette(image, kept.foreground, kept.detached);
  if (measured === null) return null;
  return {
    foreground: kept.foreground,
    bounds: { x0: measured.minX, y0: measured.minY, x1: measured.maxX, y1: measured.maxY },
    footRow: measured.footY,
  };
}

/**
 * The colours the reference is really made of.
 *
 * Every foreground pixel of the source, bucketed coarsely first so a JPEG's
 * ringing collapses into the colour it is ringing around rather than arriving
 * as ten thousand near-duplicates, then reduced by the studio's own weighted
 * median cut in OKLab.
 */
function sourcePalette(image: SourceImage, foreground: Foreground, cap: number): Rgb[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let p = 0; p < foreground.length; p++) {
    if (foreground[p] === 0) continue;
    const i = p * 4;
    const r = image.data[i] ?? 0;
    const g = image.data[i + 1] ?? 0;
    const b = image.data[i + 2] ?? 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  if (buckets.size === 0) return [];
  const found = [...buckets.values()];
  const palette: Rgb[] = found.map((bucket) => [
    Math.round(bucket.r / bucket.n),
    Math.round(bucket.g / bucket.n),
    Math.round(bucket.b / bucket.n),
  ]);
  // capPalette weighs entries by how many CELLS carry them, so the weights are
  // handed over as one cell per source pixel of that colour.
  const weights = new Int16Array(found.reduce((sum, bucket) => sum + Math.min(bucket.n, 1 << 14), 0));
  let at = 0;
  found.forEach((bucket, index) => {
    for (let k = 0; k < Math.min(bucket.n, 1 << 14); k++) weights[at++] = index;
  });
  return dedupePalette(capPalette(weights, palette, cap));
}

export interface CanonicalTarget {
  /** The figure on the character's canvas, as palette indices. */
  grid: CellGrid;
  palette: Rgb[];
  /** What the figure measures there — the numbers the author must match. */
  figureW: number;
  figureH: number;
  /** Source pixels per canvas pixel. */
  reduction: number;
}

export interface CanonicalOptions {
  canvasW: number;
  canvasH: number;
  groundRow: number;
  /** Share of the canvas height the figure stands at. */
  fill: number;
  /** How many colours the target keeps. */
  colours: number;
}

/**
 * Put the figure on the character's canvas.
 *
 * `rawGrid` samples the mean of the foreground pixels each canvas cell covers
 * and reports the coverage separately, unrounded, exactly as the animation
 * path does — and then the palette snap turns those means back into colours
 * the reference really has. That two-step is what keeps a hard edge hard: it
 * was mean colour ALONE, written out directly, that came back visibly blurred
 * beside the original.
 */
export function canonicalise(
  image: SourceImage,
  figure: ReferenceFigure,
  options: CanonicalOptions,
): CanonicalTarget | null {
  const srcW = figure.bounds.x1 - figure.bounds.x0 + 1;
  const srcH = figure.bounds.y1 - figure.bounds.y0 + 1;
  if (srcW < 1 || srcH < 1) return null;

  const figureH = Math.max(1, Math.round(options.canvasH * options.fill));
  const reduction = srcH / figureH;
  const figureW = Math.max(1, Math.round(srcW / reduction));
  // The origin is in SOURCE pixels, and it is anchored to the two edges that
  // have to land exactly: the bottom of the figure on the ground row, and the
  // figure's own horizontal middle on the canvas's. Anchoring from the top
  // instead let rounding push a row of overhang one below the ground row,
  // which is a character standing through the floor.
  const raw = rawGrid(
    image,
    figure.foreground,
    reduction,
    (figure.bounds.x0 + figure.bounds.x1 + 1) / 2 - (options.canvasW / 2) * reduction,
    figure.bounds.y1 + 1 - (options.groundRow + 1) * reduction,
    options.canvasW,
    options.canvasH,
  );

  // The palette is measured on the SOURCE, not on the reduction. This is the
  // whole reason a reduced reference can still have hard edges: a cell
  // straddling a boundary averages to a colour that is in neither region, and
  // taking the palette from those averages enshrines the smear. Measured on a
  // two-colour figure, the reduction alone produced twelve palette entries.
  // Snapping the averages back to colours the source really has puts every
  // boundary cell on one side or the other.
  const source = sourcePalette(image, figure.foreground, options.colours);
  if (source.length === 0) return null;
  const quantised = quantiseSequence([raw], source, { memory: false });
  const grid = quantised.frames[0];
  if (grid === undefined) return null;

  const capped = dedupePalette(capPalette(grid.cells, source, options.colours));
  return {
    grid: { cols: grid.cols, rows: grid.rows, cells: remapCells(grid.cells, source, capped) },
    palette: capped,
    figureW,
    figureH,
    reduction,
  };
}

export interface ReferenceMaterial {
  /** Light to dark, as six-digit hex without a '#'. */
  shades: string[];
  /** Share of the figure this ramp covers, 0..1. */
  share: number;
}

/**
 * The reference's colours as material ramps, commonest first.
 *
 * Ramps rather than a flat list because that is the shape the author has to
 * declare anyway — a part's ramp is every colour it may grade to. Which ramp
 * is armour and which is leather is left to the model looking at the picture;
 * a rule here would be a guess wearing the authority of code.
 */
export function referenceMaterials(target: CanonicalTarget): ReferenceMaterial[] {
  const counts = new Int32Array(target.palette.length);
  let total = 0;
  for (const cell of target.grid.cells) {
    if (cell === TRANSPARENT || cell < 0 || cell >= counts.length) continue;
    counts[cell]++;
    total++;
  }
  if (total === 0) return [];
  return buildRamps(target.palette)
    .map((ramp) => ({
      // positionOf is 0 at the darkest member; a Paint ramp is declared
      // lightest first, so the members are ordered that way here.
      shades: [...ramp.indexes]
        .sort((a, b) => (ramp.positionOf.get(b) ?? 0) - (ramp.positionOf.get(a) ?? 0))
        .map((index) => toHex(target.palette[index] as Rgb).replace('#', '')),
      share: ramp.indexes.reduce((sum, index) => sum + (counts[index] ?? 0), 0) / total,
    }))
    .sort((a, b) => b.share - a.share);
}

/** Draw a cell grid as pixels, magnified, on a flat backdrop — the reference
 * and the render must reach a vision model the same way or the comparison is
 * about presentation. */
export function renderGrid(
  grid: CellGrid,
  palette: Palette,
  scale: number,
  backdrop: readonly number[],
): SourceImage {
  const width = grid.cols * scale;
  const height = grid.rows * scale;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid.cells[Math.floor(y / scale) * grid.cols + Math.floor(x / scale)] ?? TRANSPARENT;
      const rgb = cell === TRANSPARENT || cell < 0 ? backdrop : (palette[cell] ?? backdrop);
      const o = (y * width + x) * 4;
      data[o] = rgb[0] as number;
      data[o + 1] = rgb[1] as number;
      data[o + 2] = rgb[2] as number;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}
