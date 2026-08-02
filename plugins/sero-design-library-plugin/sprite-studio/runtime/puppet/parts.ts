/**
 * The character taken apart (Ink & Bones plan, Phase 1b — Dan's item).
 *
 * A skeleton is painted a bone at a time, but the author is shown a whole
 * assembled figure and has to work every piece back out of it: which of those
 * pixels is the pauldron, where the helmet ends and the gorget begins, how long
 * the blade is against the arm holding it. One more paid picture answers that
 * directly — the same character drawn as separate pieces laid out apart from
 * each other — and the pieces are then found by measurement rather than by
 * guessing, because a parts sheet's whole point is that its masses do not touch.
 *
 * What the author gets is each piece cropped, standing at the SAME scale as the
 * canonical target, with its size in canvas pixels stated. That last part is
 * the useful bit: "the helmet is 22 x 19 of your 112 x 144 canvas" is a fact
 * the author can paint to, where "there is a helmet" is not.
 *
 * The pieces are reference, not bitmaps to blit. Cutting a finished
 * illustration into rotating sprite parts is a different and much larger job
 * (plan option 5); this is option 4, and it is here because the loop's problem
 * was never a shortage of pixels, it was not knowing what the shapes are.
 */

import { floodForeground, labelBodies } from '../../engine/key';
import { quantiseSequence } from '../../engine/quantise';
import { rawGrid } from '../../engine/resample';
import type { CellGrid, Foreground, Palette, SourceImage } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';

/** A piece smaller than this share of the biggest one is a speck the sheet
 * happened to leave behind, not a part of the character. */
const MIN_SHARE = 0.02;

/** More than this and the sheet did not come apart into parts — it came apart
 * into noise, and showing forty specks would bury the real pieces. */
const MAX_PIECES = 14;

export interface CharacterPart {
  /** The piece on its own small canvas, at the target's scale. */
  grid: CellGrid;
  /** What it measures in canvas pixels — the number the author paints to. */
  width: number;
  height: number;
}

export interface SplitParts {
  parts: CharacterPart[];
  /** ONE palette for every piece — the target's. */
  palette: Palette;
}

/** The instruction for the parts sheet. Laid out APART is the whole
 * requirement: pieces that touch cannot be told apart afterwards, and the
 * separation is what makes the measurement honest rather than a segmentation
 * guess. */
export function buildPartsSheetPrompt(): string {
  return [
    'Draw the parts of this exact character laid out separately, like an assembly sheet.',
    'Each piece drawn on its own, clearly apart from every other piece, never touching or overlapping:',
    'the head or helmet, the torso, one upper arm, one forearm or hand, one thigh, one lower leg, one foot or boot,',
    'and each separate item of equipment or clothing.',
    'Same character, same colours, same style, same pixel-art resolution, each piece seen from the side.',
    'Plain flat background, evenly spaced, no labels, no text, no outlines around the layout.',
  ].join(' ');
}

/**
 * Find the pieces on a parts sheet and put each at the target's scale.
 *
 * `reduction` comes from the canonical target, so a helmet measured here is a
 * helmet the author can paint at that many canvas pixels. Measuring each piece
 * at its own scale would be worse than useless: every piece would come back
 * looking the same size.
 */
export function splitParts(
  image: SourceImage,
  options: { reduction: number; palette: Palette },
): SplitParts {
  const foreground = floodForeground(image);
  const { label, sizes } = labelBodies(foreground, image.width, image.height);
  if (sizes.length === 0) return { parts: [], palette: options.palette };
  const biggest = Math.max(...sizes);

  const bounds = sizes.map(() => ({ x0: image.width, y0: image.height, x1: -1, y1: -1 }));
  for (let p = 0; p < label.length; p++) {
    const id = label[p];
    if (id === undefined || id < 0) continue;
    const box = bounds[id];
    if (box === undefined) continue;
    const x = p % image.width;
    const y = (p - x) / image.width;
    if (x < box.x0) box.x0 = x;
    if (x > box.x1) box.x1 = x;
    if (y < box.y0) box.y0 = y;
    if (y > box.y1) box.y1 = y;
  }

  const kept = sizes
    .map((size, id) => ({ id, size }))
    .filter((piece) => piece.size >= biggest * MIN_SHARE)
    // Biggest first: the torso and the helmet are what the author needs most,
    // and a truncated list should lose the buckle rather than the body.
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_PIECES);

  const parts: CharacterPart[] = [];
  for (const piece of kept) {
    const box = bounds[piece.id];
    if (box === undefined || box.x1 < box.x0) continue;
    // Only this piece is foreground while it is sampled, so a neighbouring
    // piece inside the same bounding box cannot bleed into it.
    const only: Foreground = new Uint8Array(foreground.length);
    for (let p = 0; p < label.length; p++) only[p] = label[p] === piece.id ? 1 : 0;

    const cols = Math.max(1, Math.round((box.x1 - box.x0 + 1) / options.reduction));
    const rows = Math.max(1, Math.round((box.y1 - box.y0 + 1) / options.reduction));
    const raw = rawGrid(image, only, options.reduction, box.x0, box.y0, cols, rows);
    // Every piece is quantised onto the TARGET's palette, not one of its own.
    // Two reasons, and the second is the one that bit: the pieces should be in
    // the character's colours to be comparable at all, and a per-piece palette
    // put 363 colours on one sheet against an indexed PNG's limit of 255.
    const grid = quantiseSequence([raw], options.palette, { memory: false }).frames[0];
    if (grid === undefined) continue;
    parts.push({ grid, width: cols, height: rows });
  }
  return { parts, palette: options.palette };
}

/**
 * Lay the pieces out on one sheet, magnified, each in its own cell.
 *
 * One picture rather than a dozen: a vision model shown fourteen separate
 * images spends its attention on where they came from, and the pieces have to
 * be seen against each other anyway — a helmet is only the right size relative
 * to the torso beside it.
 */
export function partsSheet(
  split: SplitParts,
  scale: number,
  backdrop: readonly number[],
  gutter = 3,
): SourceImage {
  const { parts, palette } = split;
  if (parts.length === 0) return { width: 1, height: 1, data: new Uint8Array(4) };
  const columns = Math.min(4, parts.length);
  const rows = Math.ceil(parts.length / columns);
  const cellW = Math.max(...parts.map((part) => part.width)) + gutter * 2;
  const cellH = Math.max(...parts.map((part) => part.height)) + gutter * 2;
  const width = cellW * columns * scale;
  const height = cellH * rows * scale;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = backdrop[0] as number;
    data[i * 4 + 1] = backdrop[1] as number;
    data[i * 4 + 2] = backdrop[2] as number;
    data[i * 4 + 3] = 255;
  }
  parts.forEach((part, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    // Bottom-aligned inside the cell, so the pieces read as standing next to
    // each other at a common scale rather than floating at random heights.
    const left = col * cellW + gutter;
    const top = row * cellH + cellH - gutter - part.height;
    for (let y = 0; y < part.height * scale; y++) {
      for (let x = 0; x < part.width * scale; x++) {
        const cell =
          part.grid.cells[Math.floor(y / scale) * part.grid.cols + Math.floor(x / scale)] ?? TRANSPARENT;
        if (cell === TRANSPARENT || cell < 0) continue;
        const rgb = palette[cell];
        if (rgb === undefined) continue;
        const o = ((top * scale + y) * width + left * scale + x) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
      }
    }
  });
  return { width, height, data };
}

/** What the sheet's caption says, so the author reads sizes rather than
 * estimating them. */
export function describeParts(parts: readonly CharacterPart[]): string {
  return parts.map((part, index) => `${index + 1}: ${part.width} x ${part.height} px`).join(', ');
}

