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

import {
  alphaForeground,
  enclosedBackground,
  floodForeground,
  hasAlpha,
  keepLargestBody,
  keyForeground,
} from './key';
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
/**
 * How much better than chance a *tolerant* match must still be.
 *
 * The exact test needs no such rule, because landing on one exact phase of a
 * grid is already unlikely. Allowing a pixel either side is not: at a cell size
 * of 2 it allows everything. This is what keeps the rescue honest.
 */
const TOLERANT_LIFT = 2;

export interface ArtGrid {
  /** File pixels per art pixel. 1 means the file is already at art size. */
  block: number;
  /** How much better than chance the edges line up. Below about 1.8 is noise. */
  lift: number;
  phaseX: number;
  phaseY: number;
  /**
   * Whether the edges landed on the grid exactly, or had to be allowed a pixel.
   *
   * A picture saved by almost anything real — an image host, a screenshot tool,
   * an editor that resampled on the way out — has block boundaries a pixel
   * wide rather than infinitely sharp, so every edge is found twice, once each
   * side. Those files are ordinary pixel art and are read by the tolerant pass;
   * this says which pass answered, so the character sheet can be honest about
   * it rather than presenting a rescue as a clean measurement.
   */
  sharp: boolean;
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

/**
 * What share of edges land on the best single phase of a grid of `block`.
 *
 * With `slack`, an edge one pixel to either side still counts. That is not a
 * loosening for its own sake: a block boundary that has been softened — by a
 * resample, by an image host, by anything that did not preserve hard steps — is
 * found twice, once each side of where it belongs. Both detections are the same
 * edge, and demanding they land on the same pixel throws away artwork that is
 * plainly on a grid.
 */
function alignment(
  edges: number[],
  block: number,
  slack = 0,
): { share: number; phase: number } {
  if (edges.length === 0) return { share: 0, phase: 0 };
  let best = 0;
  let phase = 0;
  for (let candidate = 0; candidate < block; candidate++) {
    let hits = 0;
    for (const edge of edges) {
      const off = (((edge - candidate) % block) + block) % block;
      if (off <= slack || off >= block - slack) hits++;
    }
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

  /**
   * The largest cell size where essentially all edges land on one phase.
   *
   * With slack, a candidate also has to beat chance by a real margin. A pixel
   * either side of a grid of 2 is every pixel there is, so a tolerant test
   * without this passes at 2 for artwork that is already at its true size —
   * and halves the character, losing every other pixel of it.
   */
  const largestFitting = (slack: number): number => {
    const window = 2 * slack + 1;
    let found = 1;
    for (let candidate = 2; candidate <= MAX_BLOCK; candidate++) {
      const across = alignment(edges.x, candidate, slack);
      const down = alignment(edges.y, candidate, slack);
      const share = Math.min(across.share, down.share);
      if (share < SHARE_FLOOR) continue;
      const chance = Math.min(1, window / candidate);
      if (share / chance < TOLERANT_LIFT) continue;
      found = candidate;
    }
    return found;
  };

  // Exact first, because a file with hard edges deserves the exact answer and
  // gives it. Only when that finds nothing is the pixel of slack allowed, and
  // the result is marked as the rescue it is.
  let block = largestFitting(0);
  const sharp = block > 1;
  if (!sharp) block = largestFitting(1);

  // Reported the way the evidence states it: how much better than chance the
  // edges line up **exactly**, whichever pass found the grid. A rescued file
  // scores lower here by construction, and that is the point — the number says
  // how sharp the picture was, not how hard we looked.
  const across = alignment(edges.x, block);
  const down = alignment(edges.y, block);
  const exact = Math.min(across.share, down.share);
  // Phases come from the pass that found it, or a rescued grid would be
  // aligned to whichever side of its soft edges happened to win.
  const phases = sharp
    ? { x: across.phase, y: down.phase }
    : { x: alignment(edges.x, block, 1).phase, y: alignment(edges.y, block, 1).phase };

  return {
    block,
    lift: block === 1 ? 0 : exact * block,
    phaseX: phases.x,
    phaseY: phases.y,
    sharp,
  };
}

export interface RecoveredArtwork {
  grid: ArtGrid;
  /** Background pockets the fill could not reach, whether or not they were taken. */
  enclosed: { regions: number; pixels: number };
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
  /**
   * Take out background the drawing has closed around — the inside of a coiled
   * whip, the gap between an arm and a body. Off by default, because a picture
   * with a painted-on background cannot say whether white inside the outline is
   * the page showing through or paint the artist put there (D7).
   */
  fillEnclosed?: boolean;
}

function foregroundOf(
  image: SourceImage,
  options: RecoverOptions,
): { foreground: Foreground; enclosed: { regions: number; pixels: number } } {
  // A picture that carries alpha has already answered the question, and its
  // answer is exact. Only a picture with no transparency in it needs the fill,
  // which is a guess by comparison — and a wrong one for a sprite cropped
  // tightly enough that the character sits on the border.
  const keyed =
    options.background === 'magenta'
      ? keyForeground(image)
      : hasAlpha(image)
        ? alphaForeground(image)
        : floodForeground(image);
  const body = keepLargestBody(keyed, image.width, image.height).foreground;
  // Always measured, so the sheet can offer the choice; only applied when the
  // choice has been made.
  const pockets = enclosedBackground(image, body);
  if (options.fillEnclosed === true) {
    for (let i = 0; i < body.length; i++) if (pockets.mask[i] === 1) body[i] = 0;
  }
  return { foreground: body, enclosed: { regions: pockets.regions, pixels: pockets.pixels } };
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
  const { foreground, enclosed } = foregroundOf(image, options);

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

  return { grid, enclosed, cols, rows, cells, palette };
}
