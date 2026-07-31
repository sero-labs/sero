/**
 * The picture the video model is given: the character on flat magenta (D7).
 *
 * Two decisions are built into this file, and both were paid for.
 *
 * **Magenta, not white.** Keying became a per-pixel test with no connectivity
 * rule and no guessing, so a hole the character encloses — the gap inside a
 * coiled whip — comes out transparent like any other background. A flood fill
 * cannot reach that hole, and a colour test on white would have eaten the whites
 * of the eyes.
 *
 * **The character occupies about 80% of the frame** (D19). A whip crack that
 * runs off the edge of the video frame arrives already cut, and no canvas
 * downstream can put it back — it is the one fault nothing can repair. Leaving
 * room for a reach is where that is prevented, and the check for it fires at the
 * point where regenerating still costs one clip rather than a whole sequence.
 */

import { encodeIndexedPng } from './png';
import type { CellGrid, Palette } from '../engine/types';
import { TRANSPARENT } from '../engine/types';

/** How much of the plate's height the character stands in, leaving room to reach. */
export const CHARACTER_SHARE = 0.62;
/** A jump needs headroom the standing pose does not, so it gets a smaller share. */
export const AIRBORNE_SHARE = 0.42;

export interface Plate {
  bytes: Buffer;
  width: number;
  height: number;
  /** Source pixels per art pixel — the scale the compiler measures against (D12). */
  scale: number;
  /** Where the character's feet were placed, in source pixels. */
  footY: number;
  footX: number;
}

export interface PlateOptions {
  /** The plate's square size. 1024 unless there is a reason. */
  canvas?: number;
  /** True when the animation leaves the ground, so the character sits lower. */
  airborne?: boolean;
  /** The character's foot row within the base pose, in art pixels. */
  footRow: number;
  centreCol: number;
}

/**
 * Build the plate.
 *
 * The enlargement is a whole number, because a fractional one blurs the pixels
 * before the model has even seen them — and every measurement downstream assumes
 * the artwork sits on a grid.
 */
export function buildPlate(
  basePose: CellGrid,
  palette: Palette,
  options: PlateOptions,
): Plate {
  const canvas = options.canvas ?? 1024;
  const share = options.airborne ? AIRBORNE_SHARE : CHARACTER_SHARE;
  const scale = Math.max(1, Math.floor((canvas * share) / Math.max(basePose.rows, 1)));

  const width = basePose.cols * scale;
  const height = basePose.rows * scale;
  const originX = Math.round((canvas - width) / 2);
  // Feet a little above the bottom edge: a landing that overshoots by a few
  // pixels should cost a warning, not a cut-off frame.
  const originY = options.airborne
    ? canvas - Math.round(canvas * 0.12) - height
    : Math.round((canvas - height) / 2);

  const cells = new Int16Array(canvas * canvas).fill(TRANSPARENT);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = basePose.cells[Math.floor(y / scale) * basePose.cols + Math.floor(x / scale)] ?? TRANSPARENT;
      if (value < 0) continue;
      const px = originX + x;
      const py = originY + y;
      if (px < 0 || py < 0 || px >= canvas || py >= canvas) continue;
      cells[py * canvas + px] = value;
    }

  return {
    // Opaque: entry 0 is magenta and stays visible. A transparent PNG would be
    // composited by the model against whatever it chose, and every measurement
    // downstream depends on the background being one flat colour we picked.
    bytes: encodeIndexedPng(cells, canvas, canvas, palette, { transparent: false }),
    width: canvas,
    height: canvas,
    scale,
    footY: originY + options.footRow * scale,
    footX: originX + options.centreCol * scale,
  };
}

/**
 * One finished frame, drawn large on flat magenta for a model to work on.
 *
 * Used for a repair and for a judgement. The 8× is not decoration: a vision
 * model receives a 173 × 156 sprite shrunk past the detail being judged, and a
 * whole contact sheet arrives at a fraction of that (D24). Enlarging with hard
 * edges keeps every art pixel a block the model can actually see.
 */
export function framePlate(
  frame: CellGrid,
  palette: Palette,
  { scale = 8, transparent = false } = {},
): { bytes: Buffer; width: number; height: number; scale: number } {
  const width = frame.cols * scale;
  const height = frame.rows * scale;
  const cells = new Int16Array(width * height).fill(TRANSPARENT);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      cells[y * width + x] =
        frame.cells[Math.floor(y / scale) * frame.cols + Math.floor(x / scale)] ?? TRANSPARENT;
    }
  return {
    bytes: encodeIndexedPng(cells, width, height, palette, { transparent }),
    width,
    height,
    scale,
  };
}

/**
 * The scale the compiler should use for frames that came back from a clip.
 *
 * The model returns its own resolution — 720p rather than the plate's 1024 —
 * so the plate's scale has to be carried across in the same proportion. Getting
 * this wrong does not fail loudly: it produces a sprite of the wrong size, which
 * then reads as the model having drawn the character bigger.
 */
export function scaleForFrame(plate: Plate, frameWidth: number): number {
  return (frameWidth / plate.width) * plate.scale;
}
