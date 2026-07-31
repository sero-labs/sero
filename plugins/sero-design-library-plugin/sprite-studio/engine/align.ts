/**
 * Comparing two frames at the offset where they actually match (D11, D26).
 *
 * A sprite shifted by one pixel differs everywhere. Measured raw, two nearly
 * identical idle frames scored 67% changed, which would have condemned a good
 * sequence; measured at the best alignment the same pair scores 33%. The winning
 * offset is not a by-product — it is the answer to how far the character drifted.
 */

import type { CellGrid, Offset, RawGrid } from './types';

/** How far the search looks, in cells, in each direction. */
const DEFAULT_RADIUS = 2;

function luminance(grid: RawGrid, at: number): number {
  return (
    0.299 * (grid.colour[at * 3] ?? 0) +
    0.587 * (grid.colour[at * 3 + 1] ?? 0) +
    0.114 * (grid.colour[at * 3 + 2] ?? 0)
  );
}

/**
 * The residual offset between two frames, measured **before colour** (D26).
 *
 * On coverage and brightness, never on palette indexes, because the palette
 * decision is about to depend on this answer. Deriving it from already-quantised
 * cells would make each step wait for the other: unstable colours would decide
 * the offset, and the offset would decide which colours are allowed to stay
 * stable.
 */
export function alignRaw(
  previous: RawGrid,
  current: RawGrid,
  radius = DEFAULT_RADIUS,
): Offset & { cost: number } {
  const { cols, rows } = current;
  let best = { dx: 0, dy: 0, cost: Infinity };
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      let cost = 0;
      let n = 0;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const sy = y + dy;
          const sx = x + dx;
          if (sy < 0 || sx < 0 || sy >= rows || sx >= cols) continue;
          const a = y * cols + x;
          const b = sy * cols + sx;
          cost += Math.abs((current.coverage[a] ?? 0) - (previous.coverage[b] ?? 0)) * 255;
          cost += Math.abs(luminance(current, a) - luminance(previous, b)) * 0.5;
          n++;
        }
      if (n > 0 && cost / n < best.cost) best = { dx, dy, cost: cost / n };
    }
  return best;
}

/**
 * How much of one frame differs from another, at the best small alignment.
 *
 * `silhouetteOnly` judges shape alone, which is what thinning wants: noise in
 * the shading must not outrank a wind-up (D23).
 */
export function frameDifference(
  a: CellGrid,
  b: CellGrid,
  { radius = 1, silhouetteOnly = false } = {},
): number {
  const { cols, rows } = a;
  let best = 1;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      let differ = 0;
      let union = 0;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const sy = y + dy;
          const sx = x + dx;
          const p = a.cells[y * cols + x] ?? -1;
          const q = sy >= 0 && sx >= 0 && sy < rows && sx < cols ? b.cells[sy * cols + sx] ?? -1 : -1;
          if (p < 0 && q < 0) continue;
          union++;
          if (silhouetteOnly ? p < 0 !== q < 0 : p !== q) differ++;
        }
      if (union > 0 && differ / union < best) best = differ / union;
    }
  return best;
}

/** The same comparison with no alignment search — fast enough for every pair. */
export function rawDifference(a: CellGrid, b: CellGrid): number {
  let differ = 0;
  let union = 0;
  for (let i = 0; i < a.cells.length; i++) {
    const p = a.cells[i] ?? -1;
    const q = b.cells[i] ?? -1;
    if (p < 0 && q < 0) continue;
    union++;
    if (p !== q) differ++;
  }
  return union > 0 ? differ / union : 1;
}
