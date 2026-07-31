/**
 * The checks that only make sense for one kind of project (spec §8.2).
 *
 * A tile has to survive being laid beside a copy of itself. An icon has to be
 * readable at the size it will actually be seen. Neither rule means anything for
 * a character, which is why the kind selects the checks rather than every
 * project answering to all of them.
 *
 * Characters are checked in `semantic.ts` — silhouette, drift, part integrity —
 * and effects deliberately have no kind checks: artwork that is meant to be a
 * scatter of sparks fails every rule written for a solid body.
 */

import { error, warning, type Fault } from '../fault';
import { countFilled, TRANSPARENT_INDEX, type Grid } from '../grid';
import { resolveFrame } from '../resolve';
import type { PixelProject } from '../schema';

/** Below this share of the canvas, an icon reads as a speck rather than a thing. */
export const MIN_ITEM_FILL = 0.15;

export function validateKind(project: PixelProject): Fault[] {
  if (project.kind === 'tile') return project.frames.flatMap((frame) => tileFaults(resolveFrame(project, frame), frame.id));
  if (project.kind === 'item') return project.frames.flatMap((frame) => itemFaults(project, resolveFrame(project, frame), frame.id));
  return [];
}

/**
 * A tile wraps when its edges agree (spec §8.2).
 *
 * The rule is edge equality: the left column must equal the right, and the top
 * row the bottom. It is stricter than it needs to be — a tile whose edges merely
 * *continue* into each other also lays flat — but equality is a fact the engine
 * can state, and "these two columns differ at row 9" is something a model can
 * act on, where "the seam looks wrong" is not.
 */
function tileFaults(grid: Grid, frameId: string): Fault[] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width < 2 || height < 2) return [];
  const faults: Fault[] = [];

  const columnMismatches = grid.reduce<number[]>((rows, row, y) => (row[0] === row[width - 1] ? rows : [...rows, y]), []);
  if (columnMismatches.length > 0) {
    faults.push(
      error(
        'tile-edge-columns',
        `frame "${frameId}" does not wrap sideways: the left column differs from the right at row${columnMismatches.length === 1 ? '' : 's'} ${columnMismatches.slice(0, 8).join(', ')}`,
        { frameId },
      ),
    );
  }

  const top = grid[0] ?? [];
  const bottom = grid[height - 1] ?? [];
  const rowMismatches = top.reduce<number[]>((columns, value, x) => (value === bottom[x] ? columns : [...columns, x]), []);
  if (rowMismatches.length > 0) {
    faults.push(
      error(
        'tile-edge-rows',
        `frame "${frameId}" does not wrap top to bottom: the top row differs from the bottom at column${rowMismatches.length === 1 ? '' : 's'} ${rowMismatches.slice(0, 8).join(', ')}`,
        { frameId },
      ),
    );
  }
  return faults;
}

function itemFaults(project: PixelProject, grid: Grid, frameId: string): Fault[] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const area = width * height;
  if (area === 0) return [];
  const faults: Fault[] = [];

  const fill = countFilled(grid) / area;
  if (fill < MIN_ITEM_FILL) {
    faults.push(
      error(
        'item-fill',
        `frame "${frameId}" fills ${Math.round(fill * 100)}% of the canvas; an icon needs at least ${Math.round(MIN_ITEM_FILL * 100)}% or it reads as a speck — draw it larger rather than moving it`,
        { frameId },
      ),
    );
  }
  faults.push(...outlineFaults(project, grid, frameId));
  return faults;
}

/**
 * Every cell on the silhouette's edge should be the outline colour.
 *
 * The outline index is the one whose role says `outline`; failing that, it is
 * whichever colour already does most of the edge, because a palette that never
 * declared roles is still allowed to have an outline.
 */
function outlineFaults(project: PixelProject, grid: Grid, frameId: string): Fault[] {
  const edges = edgeCells(grid);
  if (edges.length === 0) return [];

  const declared = project.palette.colours.findIndex((colour) => colour.role === 'outline');
  const outline = declared > 0 ? declared : commonest(edges.map(([, , value]) => value));
  const gaps = edges.filter(([, , value]) => value !== outline);
  if (gaps.length === 0) return [];

  // Nothing on the edge is the outline colour, so there is no outline at all —
  // a different fault from an outline with holes in it.
  if (gaps.length === edges.length) {
    return [error('item-no-outline', `frame "${frameId}" has no outline: none of its ${edges.length} edge cells use one colour`, { frameId })];
  }
  const where = gaps.slice(0, 8).map(([x, y]) => `${x},${y}`).join(' ');
  return [
    warning(
      'item-outline-gap',
      `frame "${frameId}" has ${gaps.length} edge cell${gaps.length === 1 ? '' : 's'} without the outline colour (${where})`,
      { frameId },
    ),
  ];
}

/** Drawn cells with transparency — or the canvas edge — on at least one side. */
function edgeCells(grid: Grid): [number, number, number][] {
  const cells: [number, number, number][] = [];
  grid.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === TRANSPARENT_INDEX) return;
      const exposed =
        (grid[y - 1]?.[x] ?? TRANSPARENT_INDEX) === TRANSPARENT_INDEX ||
        (grid[y + 1]?.[x] ?? TRANSPARENT_INDEX) === TRANSPARENT_INDEX ||
        (row[x - 1] ?? TRANSPARENT_INDEX) === TRANSPARENT_INDEX ||
        (row[x + 1] ?? TRANSPARENT_INDEX) === TRANSPARENT_INDEX;
      if (exposed) cells.push([x, y, value]);
    }),
  );
  return cells;
}

function commonest(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [TRANSPARENT_INDEX, -1])[0];
}
