/**
 * Placements, then patch, then locks (spec §9, P9).
 *
 * Resolution is the one place a frame becomes pixels, and the order is the whole
 * point. Locks are not *checked* last, they are *applied* last, so there is no
 * code path — model output, a tool, an import, a migration — that can land on a
 * cell after the user's own value has been written. A rule enforced by ordering
 * cannot be forgotten by a caller.
 *
 * Resolution assumes a validated project. An unknown part is a programming
 * fault, not a data fault, so it throws rather than drawing something wrong and
 * saying nothing; `validate/structural.ts` catches it first for anything that
 * came from outside.
 */

import { blankGrid, decodeGrid, flipGridX, TRANSPARENT_INDEX, type Grid } from './grid';
import { findPart, isInsideCanvas, placementRows, type Frame, type PixelProject, type Placement } from './schema';

/** No placement drew this cell. */
export const NO_OWNER = -1;

export interface ResolveTrace {
  grid: Grid;
  /**
   * Which placement drew each cell, as an index into `frame.placements`, before
   * the patch and the locks ran. The part-integrity check reads it to tell a
   * legitimate overlap — a later part covering an earlier one — from a patch
   * quietly repainting a part instead of declaring a variant (spec §8.2).
   */
  owner: number[][];
}

export function resolveFrame(project: PixelProject, frame: Frame): Grid {
  return resolveFrameTraced(project, frame).grid;
}

export function resolveFrameTraced(project: PixelProject, frame: Frame): ResolveTrace {
  const { width, height } = project.canvas;
  const paletteSize = project.palette.colours.length;

  const grid = frame.rows ? decodeGrid(frame.rows, width, height, paletteSize).grid : blankGrid(width, height);
  const owner = Array.from({ length: height }, () => new Array<number>(width).fill(NO_OWNER));

  frame.placements.forEach((placement, placementIndex) => {
    const pixels = placementGrid(project, placement);
    const part = findPart(project, placement.partId);
    if (part === undefined) return;
    const left = part.origin.x + placement.dx;
    const top = part.origin.y + placement.dy;
    pixels.forEach((row, y) =>
      row.forEach((value, x) => {
        // A transparent cell of a part never erases what is under it: parts
        // overlap at their joints by design, and an erasing stamp would open
        // the very seam the overlap exists to close (P5).
        if (value === TRANSPARENT_INDEX) return;
        const targetX = left + x;
        const targetY = top + y;
        if (!isInsideCanvas(project.canvas, targetX, targetY)) return;
        grid[targetY][targetX] = value;
        owner[targetY][targetX] = placementIndex;
      }),
    );
  });

  for (const cell of frame.patch) {
    if (!isInsideCanvas(project.canvas, cell.x, cell.y)) continue;
    grid[cell.y][cell.x] = cell.index;
  }

  for (const lock of frame.locks) {
    if (!isInsideCanvas(project.canvas, lock.x, lock.y)) continue;
    grid[lock.y][lock.x] = lock.index;
  }

  return { grid, owner };
}

/** The pixels one placement draws, mirrored if it asked to be. */
export function placementGrid(project: PixelProject, placement: Placement): Grid {
  const part = findPart(project, placement.partId);
  if (part === undefined) throw new Error(`placement names part "${placement.partId}", which the project does not have`);
  const rows = placementRows(part, placement);
  if (rows === undefined) {
    throw new Error(`placement names variant "${placement.variantId}" of part "${part.id}", which the part does not have`);
  }
  const { grid } = decodeGrid(rows, part.size.width, part.size.height, project.palette.colours.length);
  return placement.flipX === true ? flipGridX(grid) : grid;
}

/** Every frame of a clip, in order. */
export function resolveClip(project: PixelProject, frameIds: readonly string[]): Grid[] {
  return frameIds.map((frameId) => {
    const frame = project.frames.find((candidate) => candidate.id === frameId);
    if (frame === undefined) throw new Error(`clip names frame "${frameId}", which the project does not have`);
    return resolveFrame(project, frame);
  });
}

/**
 * The frame a hand edit produces: the cell becomes a lock, so it survives every
 * later regeneration until the user clears it (P9, spec §10).
 */
export function lockCell(frame: Frame, x: number, y: number, index: number): Frame {
  const locks = frame.locks.filter((lock) => lock.x !== x || lock.y !== y);
  locks.push({ x, y, index });
  return { ...frame, locks };
}

export function clearLocks(frame: Frame, cells?: readonly { x: number; y: number }[]): Frame {
  if (cells === undefined) return { ...frame, locks: [] };
  const cleared = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  return { ...frame, locks: frame.locks.filter((lock) => !cleared.has(`${lock.x},${lock.y}`)) };
}
