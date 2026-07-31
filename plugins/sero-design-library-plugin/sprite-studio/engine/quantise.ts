/**
 * Quantising, as a sequence rather than as frames (D20).
 *
 * Snapping each frame to the nearest palette entry on its own is what makes a
 * sprite *boil*: a cell whose source colour sits between two shades flips
 * between them as the video noise moves, and contours crawl even where nothing
 * is happening. The change percentage cannot catch that, because it cannot tell
 * noise from intended movement — so the fix belongs in the quantiser rather than
 * in the validator.
 *
 * A cell keeps the entry it had unless the new source colour beats it by a
 * margin, and only where the source barely moved: one offset cannot describe a
 * swinging arm, so a limb that is genuinely moving gets no memory, which is
 * correct — it is supposed to change (D26).
 */

import { labDistance, nearestEntry, oklab, type Lab } from './colour';
import { alignRaw } from './align';
import type { CellGrid, Offset, Palette, RawGrid } from './types';
import { TRANSPARENT } from './types';

export interface QuantiseOptions {
  memory?: boolean;
  /**
   * How much closer a different entry has to be before a steady cell changes.
   *
   * Measured on the explorer idle: 0.03 removes about two thirds of the churn
   * for about a tenth more colour residual. It has no theoretically right value
   * and is tuned against a real idle.
   */
  margin?: number;
  /** The same idea for the in-or-out decision, so edge cells stop flickering. */
  alphaMargin?: number;
  /** How still a cell's source has to be for memory to apply at all. */
  staticColour?: number;
}

export interface QuantisedSequence {
  frames: CellGrid[];
  /** The alignment used against the previous frame, per frame. */
  offsets: Offset[];
  /**
   * How far each frame's drawn colour sat from the entry it was given.
   *
   * This is the fidelity signal: it rises when the model relights the character,
   * and unlike ramp usage it does not care which parts are visible in this pose.
   */
  residuals: number[];
  /** The share of cells whose colour was not within tolerance of the palette. */
  offPalette: number[];
}

export const DEFAULT_QUANTISE: Required<QuantiseOptions> = {
  memory: true,
  margin: 0.03,
  alphaMargin: 0.12,
  staticColour: 26,
};

/** Beyond this distance in OKLab, the drawn colour was not on the palette. */
const OFF_PALETTE = 0.08;

/** How far the source colour of one cell moved since the previous frame. */
function sourceMovement(current: RawGrid, previous: RawGrid, at: number, prevAt: number): number {
  return (
    Math.abs((current.colour[at * 3] ?? 0) - (previous.colour[prevAt * 3] ?? 0)) +
    Math.abs((current.colour[at * 3 + 1] ?? 0) - (previous.colour[prevAt * 3 + 1] ?? 0)) +
    Math.abs((current.colour[at * 3 + 2] ?? 0) - (previous.colour[prevAt * 3 + 2] ?? 0)) +
    Math.abs((current.coverage[at] ?? 0) - (previous.coverage[prevAt] ?? 0)) * 255
  );
}

export function quantiseSequence(
  grids: RawGrid[],
  palette: Palette,
  options: QuantiseOptions = {},
): QuantisedSequence {
  const { memory, margin, alphaMargin, staticColour } = { ...DEFAULT_QUANTISE, ...options };
  const paletteLab: Lab[] = palette.map((entry) => oklab(entry));
  const first = grids[0];
  if (first === undefined) return { frames: [], offsets: [], residuals: [], offPalette: [] };
  const { cols, rows } = first;

  const frames: CellGrid[] = [];
  const offsets: Offset[] = [];
  const residuals: number[] = [];
  const offPalette: number[] = [];

  for (const [f, grid] of grids.entries()) {
    const previousGrid = f > 0 ? grids[f - 1] : undefined;
    const previous = f > 0 ? frames[f - 1] : undefined;
    const offset =
      previousGrid === undefined ? { dx: 0, dy: 0 } : alignRaw(previousGrid, grid);
    offsets.push({ dx: offset.dx, dy: offset.dy });

    const cells = new Int16Array(cols * rows).fill(TRANSPARENT);
    let residualSum = 0;
    let drawn = 0;
    let off = 0;

    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const at = y * cols + x;
        const coverage = grid.coverage[at] ?? 0;
        const sy = y + offset.dy;
        const sx = x + offset.dx;
        const prevAt = sy >= 0 && sx >= 0 && sy < rows && sx < cols ? sy * cols + sx : -1;
        const prevIndex =
          memory && previous !== undefined && prevAt >= 0 ? previous.cells[prevAt] ?? TRANSPARENT : TRANSPARENT;

        // How much the source itself moved here. Memory only applies where the
        // answer is "barely" — elsewhere the change is real and must show.
        const moved =
          prevAt >= 0 && previousGrid !== undefined
            ? sourceMovement(grid, previousGrid, at, prevAt)
            : Infinity;
        const steady = memory && moved < staticColour;

        // Alpha, with the same memory so edge cells stop flickering in and out.
        const opaque = steady
          ? coverage >= (prevIndex >= 0 ? 0.5 - alphaMargin : 0.5 + alphaMargin)
          : coverage >= 0.5;
        if (!opaque) continue;

        const lab = oklab([
          grid.colour[at * 3] ?? 0,
          grid.colour[at * 3 + 1] ?? 0,
          grid.colour[at * 3 + 2] ?? 0,
        ]);
        const best = nearestEntry(paletteLab, lab);
        const keep = steady && prevIndex >= 0 ? paletteLab[prevIndex] : undefined;
        const chosen =
          keep !== undefined && labDistance(keep, lab) - best.distance <= margin
            ? prevIndex
            : best.index;
        cells[at] = chosen;
        residualSum += labDistance(paletteLab[chosen] ?? lab, lab);
        if (best.distance > OFF_PALETTE) off++;
        drawn++;
      }

    frames.push({ cols, rows, cells });
    residuals.push(drawn > 0 ? residualSum / drawn : 0);
    offPalette.push(drawn > 0 ? off / drawn : 0);
  }

  return { frames, offsets, residuals, offPalette };
}

/**
 * Churn where nothing was happening — the number that catches boil.
 *
 * Only cells whose source barely changed are counted, so real movement cannot
 * flatter or spoil the score.
 */
export function staticChurn(
  grids: RawGrid[],
  frames: CellGrid[],
  offsets: Offset[],
  { staticColour = DEFAULT_QUANTISE.staticColour } = {},
): { churn: number; considered: number } {
  const first = grids[0];
  if (first === undefined) return { churn: 0, considered: 0 };
  const { cols, rows } = first;
  let churned = 0;
  let considered = 0;

  for (let f = 1; f < grids.length; f++) {
    const grid = grids[f];
    const previousGrid = grids[f - 1];
    const frame = frames[f];
    const previous = frames[f - 1];
    const offset = offsets[f];
    if (!grid || !previousGrid || !frame || !previous || !offset) continue;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const at = y * cols + x;
        const sy = y + offset.dy;
        const sx = x + offset.dx;
        if (sy < 0 || sx < 0 || sy >= rows || sx >= cols) continue;
        const prevAt = sy * cols + sx;
        if (sourceMovement(grid, previousGrid, at, prevAt) >= staticColour) continue;
        considered++;
        if (frame.cells[at] !== previous.cells[prevAt]) churned++;
      }
  }
  return { churn: considered > 0 ? churned / considered : 0, considered };
}
