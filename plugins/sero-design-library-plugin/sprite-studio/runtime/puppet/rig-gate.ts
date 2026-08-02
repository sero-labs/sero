/**
 * The bind-pose gate: does the rig actually reproduce the picture?
 *
 * A rig built from bitmap pieces makes a claim no still frame can be trusted to
 * settle by eye — that the rest frame IS the reference again. The claim is
 * worth making because everything after it depends on it: if the pieces do not
 * land where they were cut, every clip is animating a mistake, and the audit
 * gates will happily pass a well-behaved wrong figure.
 *
 * It is also a claim with teeth. Building this caught a sign error in the pivot
 * maths — `fromRot` rotates by minus its angle, so undoing a parent's rotation
 * rotates by plus — which displaced every piece below a joint and which nothing
 * else in the pipeline would have reported.
 *
 * **What it compares against.** Not the raw reference: the reference as the
 * engine's own grade leaves it. The despeckle rule deliberately destroys lone
 * pixels, and hand-drawn art is full of them, so measuring against the raw
 * picture charges the rig for a house style it is obeying. Both numbers are
 * reported — the second one is how much of the reference's fine detail the
 * grade costs, which is a real thing to know and not a failure.
 */

import type { Color } from '@sero-ai/ink-and-bones';
import { Img, colorKey, despeckle } from '@sero-ai/ink-and-bones';

import type { CellGrid, Palette } from '../../engine/types';

/** Share of the figure that may differ and still pass. Zero is achievable and
 * usual: a joint on a quarter-pixel lands every piece on an exact pixel
 * boundary. A joint placed off that grid blends one row of edge cells, which
 * is a fraction of a percent, not a broken rig. */
export const BIND_TOLERANCE = 0.005;

export interface BindReport {
  /** Opaque cells in the graded target — what the rest frame had to match. */
  cells: number;
  /** Cells the rest frame got exactly right. */
  same: number;
  /** Cells drawn in the wrong colour, or not drawn at all. */
  differ: number;
  /** Of those, cells the rest frame left empty. */
  missing: number;
  /** How many cells the grade's despeckle rule changed on the way in — the
   * price of the house style, not a fault of the rig. */
  gradeCost: number;
  ok: boolean;
  text: string;
}

/** The target as the engine's grade would leave it, ready to compare against a
 * baked frame. Exported because a review picture wants the same thing. */
export function gradedTarget(grid: CellGrid, palette: Palette): { img: Img; changed: number } {
  const img = new Img(grid.cols, grid.rows);
  const before: (string | null)[] = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[y * grid.cols + x];
      if (cell === undefined || cell < 0 || cell >= palette.length) {
        before.push(null);
        continue;
      }
      const rgb = palette[cell];
      const colour: Color = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1];
      img.set(x, y, colour);
      before.push(colorKey(colour));
    }
  }
  despeckle(img, []);
  let changed = 0;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const was = before[y * grid.cols + x] ?? null;
      const now = img.alpha(x, y) >= 0.5 ? colorKey(img.get(x, y)) : null;
      if (was !== now) changed++;
    }
  }
  return { img, changed };
}

/**
 * Measure a baked rest frame against the picture it was cut from.
 *
 * Only the target's own cells are judged. The engine lays a 1px ink ring around
 * the silhouette on purpose, so cells the target left empty are not counted
 * against the rig.
 */
export function bindPose(
  rest: Img,
  grid: CellGrid,
  palette: Palette,
  tolerance = BIND_TOLERANCE,
): BindReport {
  const graded = gradedTarget(grid, palette);
  let same = 0;
  let differ = 0;
  let missing = 0;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (graded.img.alpha(x, y) < 0.5) continue;
      if (rest.alpha(x, y) < 0.5) {
        differ++;
        missing++;
        continue;
      }
      if (colorKey(rest.get(x, y)) === colorKey(graded.img.get(x, y))) same++;
      else differ++;
    }
  }
  const cells = same + differ;
  const share = cells === 0 ? 1 : differ / cells;
  const ok = cells > 0 && share <= tolerance;
  return {
    cells,
    same,
    differ,
    missing,
    gradeCost: graded.changed,
    ok,
    text:
      cells === 0
        ? 'the target has no cells to reproduce — there is nothing to rig'
        : ok
          ? `the rest frame reproduces ${same} of ${cells} cells (${differ} differ, ${missing} missing); ` +
            `the grade's despeckle rule changed ${graded.changed} cells of the reference on the way in`
          : `the rest frame differs from the target on ${differ} of ${cells} cells ` +
            `(${(share * 100).toFixed(2)}%, ${missing} of them not drawn at all). The pieces are not landing ` +
            'where they were cut: check the bone pivots and the stamp offsets before animating anything',
  };
}
