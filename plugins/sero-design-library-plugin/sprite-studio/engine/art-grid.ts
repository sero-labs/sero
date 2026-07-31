/**
 * Recovering the artwork underneath a picture (D3, D8).
 *
 * A pixel art image has two sizes. The reference the user supplied is a
 * 784 × 1168 file whose artwork is 62 × 136, enlarged eight times. That was
 * measured rather than assumed: colour edges land on a grid of 8 four times more
 * often than chance allows, with confirming harmonics at 4 and 16.
 *
 * So working size is set by the artwork, not by the file. Everything downstream
 * — the palette, the canvas, the export scale — depends on getting this right,
 * and it is found by measurement with the lift reported, so a picture that sits
 * on no grid at all says so instead of producing a plausible wrong answer.
 */

import { floodForeground, keepLargestBody, keyForeground } from './key';
import type { Foreground, Rgb, SourceImage } from './types';
import { TRANSPARENT } from './types';

/** How different two neighbouring pixels must be to count as an edge. */
const EDGE = 60;
/** The largest cell size worth testing. */
const MAX_BLOCK = 16;
/**
 * The share of edges that must still land on one phase for a cell size to be
 * called the grid.
 *
 * Not 1: a picture that has been resized or compressed on its way to us has
 * edges that miss by a pixel, and demanding perfection would report "no grid"
 * for artwork that plainly has one.
 */
const SHARE_FLOOR = 0.85;

export interface ArtGrid {
  /** File pixels per art pixel. 1 means the file is already at art size. */
  block: number;
  /** How much better than chance the edges line up. Below about 1.8 is noise. */
  lift: number;
  phaseX: number;
  phaseY: number;
}

function edgesOf(
  image: SourceImage,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number[]; y: number[] } {
  const at = (x: number, y: number): Rgb => {
    const i = (y * image.width + x) * 4;
    return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
  };
  const distance = (p: Rgb, q: Rgb): number =>
    Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);

  const x: number[] = [];
  const y: number[] = [];
  for (let row = box.minY; row <= box.maxY; row++)
    for (let column = box.minX + 1; column <= box.maxX; column++)
      if (distance(at(column, row), at(column - 1, row)) > EDGE) x.push(column);
  for (let column = box.minX; column <= box.maxX; column++)
    for (let row = box.minY + 1; row <= box.maxY; row++)
      if (distance(at(column, row), at(column, row - 1)) > EDGE) y.push(row);
  return { x, y };
}

/** What share of edges land on the best single phase of a grid of `block`. */
function alignment(edges: number[], block: number): { share: number; phase: number } {
  if (edges.length === 0) return { share: 0, phase: 0 };
  let best = 0;
  let phase = 0;
  for (let candidate = 0; candidate < block; candidate++) {
    let hits = 0;
    for (const edge of edges) if ((edge - candidate) % block === 0) hits++;
    if (hits > best) {
      best = hits;
      phase = candidate;
    }
  }
  return { share: best / edges.length, phase };
}

/**
 * The cell size the artwork was drawn at.
 *
 * The question asked is "do essentially **all** the colour edges fall on one
 * phase of this grid?", and the answer is the **largest** cell size where that
 * still holds. Two families of wrong answer are ruled out by that phrasing:
 *
 *  - **Divisors.** Every multiple of 8 is also a multiple of 4 and of 2, so
 *    those score perfectly too. The largest wins, which is the true grid.
 *  - **Multiples.** A grid of 8 splits its edges across two phases of 16, so 16
 *    fails the test unless the artwork really is at 16.
 *
 * An earlier version scored candidates by lift — the share times the block, so
 * that bigger grids had to earn their size — and took the first clear winner
 * going up. It reported 16 for artwork drawn at 8 whenever the edge mass split
 * unevenly between the two phases, which is most artwork; the reference file
 * survived it only because its split happened to be exactly even.
 *
 * A file with no grid at all — artwork already at its true size — reaches the
 * floor nowhere, and the honest answer for that is 1.
 */
export function detectArtGrid(
  image: SourceImage,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): ArtGrid {
  const edges = edgesOf(image, box);
  let block = 1;
  let share = 1;
  for (let candidate = 2; candidate <= MAX_BLOCK; candidate++) {
    const across = alignment(edges.x, candidate);
    const down = alignment(edges.y, candidate);
    const both = Math.min(across.share, down.share);
    if (both >= SHARE_FLOOR) {
      block = candidate;
      share = both;
    }
  }
  return {
    block,
    // Reported the way the evidence states it: how much better than chance the
    // edges line up. A grid of 8 that holds perfectly is 8× better than chance.
    lift: block === 1 ? 0 : share * block,
    phaseX: alignment(edges.x, block).phase,
    phaseY: alignment(edges.y, block).phase,
  };
}

export interface RecoveredArtwork {
  grid: ArtGrid;
  cols: number;
  rows: number;
  /** One palette index per art pixel, `TRANSPARENT` outside the character. */
  cells: Int16Array;
  palette: Rgb[];
}

export interface RecoverOptions {
  /**
   * How the background comes off. Everything we generate is drawn on flat
   * magenta; a picture the user supplied is flood filled from the border
   * instead, so the whites of the eyes are not eaten (D7).
   */
  background: 'magenta' | 'flood';
  /** Colours closer than this in sRGB are the same colour. */
  merge?: number;
  /** A cell needs this share of its area drawn to be part of the sprite. */
  coverage?: number;
}

function foregroundOf(image: SourceImage, options: RecoverOptions): Foreground {
  const keyed = options.background === 'magenta' ? keyForeground(image) : floodForeground(image);
  return keepLargestBody(keyed, image.width, image.height).foreground;
}

/**
 * The artwork at its real size: find the grid, take the dominant colour of each
 * cell, and merge near-identical colours into a palette.
 *
 * The dominant colour rather than the mean, because a mean across a boundary
 * invents a colour that is in neither of the two cells it came from.
 */
export function recoverArtwork(image: SourceImage, options: RecoverOptions): RecoveredArtwork | null {
  const merge = options.merge ?? 24;
  const coverage = options.coverage ?? 0.5;
  const foreground = foregroundOf(image, options);

  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (foreground[y * image.width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;

  const grid = detectArtGrid(image, { minX, minY, maxX, maxY });
  const { block } = grid;
  const startX = minX - (((minX - grid.phaseX) % block) + block) % block;
  const startY = minY - (((minY - grid.phaseY) % block) + block) % block;
  const cols = Math.ceil((maxX + 1 - startX) / block);
  const rows = Math.ceil((maxY + 1 - startY) / block);

  const palette: Rgb[] = [];
  const cells = new Int16Array(cols * rows).fill(TRANSPARENT);

  for (let ry = 0; ry < rows; ry++)
    for (let rx = 0; rx < cols; rx++) {
      const tally = new Map<string, { n: number; r: number; g: number; b: number }>();
      let drawn = 0;
      for (let y = 0; y < block; y++)
        for (let x = 0; x < block; x++) {
          const px = startX + rx * block + x;
          const py = startY + ry * block + y;
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          const at = py * image.width + px;
          if (!foreground[at]) continue;
          drawn++;
          const r = image.data[at * 4] ?? 0;
          const g = image.data[at * 4 + 1] ?? 0;
          const b = image.data[at * 4 + 2] ?? 0;
          // Bucketed before tallying, so noise inside one flat area does not
          // split its vote across a dozen near-identical colours.
          const bucket = `${r >> 2},${g >> 2},${b >> 2}`;
          const seen = tally.get(bucket);
          if (seen) {
            seen.n++;
            seen.r += r;
            seen.g += g;
            seen.b += b;
          } else {
            tally.set(bucket, { n: 1, r, g, b });
          }
        }
      if (drawn < block * block * coverage) continue;
      const winner = [...tally.values()].toSorted((a, b) => b.n - a.n)[0];
      if (winner === undefined) continue;
      const colour: Rgb = [
        Math.round(winner.r / winner.n),
        Math.round(winner.g / winner.n),
        Math.round(winner.b / winner.n),
      ];
      let index = palette.findIndex(
        (entry) =>
          Math.abs(entry[0] - colour[0]) + Math.abs(entry[1] - colour[1]) + Math.abs(entry[2] - colour[2]) <
          merge,
      );
      if (index < 0) {
        palette.push(colour);
        index = palette.length - 1;
      }
      cells[ry * cols + rx] = index;
    }

  return { grid, cols, rows, cells, palette };
}
