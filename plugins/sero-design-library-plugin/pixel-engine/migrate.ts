/**
 * Changing an invariant after the art exists (spec §5, P10).
 *
 * Nothing about a project is permanent except that index 0 is transparent, so
 * the canvas, the palette and the pivot each change through a migration here.
 * Every one of them obeys the same three rules:
 *
 * - It is **atomic**: it returns a whole new project or it returns the old one.
 * - It is **reported**: what it touched and what it cost is in the report, not
 *   in a log line nobody reads.
 * - It **refuses to destroy hand work**: a migration that would clip a locked
 *   cell stops and says so, unless the user has said to go ahead.
 *
 * The input project is never modified.
 */

import { error, type Fault } from './fault';
import { countFilled, decodeGrid, encodeGrid, MAX_PALETTE_SIZE, TRANSPARENT_INDEX, type Grid } from './grid';
import { parseHex } from './render';
import { MAX_CANVAS_SIDE, type Cell, type PaletteColour, type Part, type PixelProject, type Point, type Size } from './schema';

export interface MigrationReport {
  kind: 'retint' | 'append' | 'remove' | 'resize' | 'pivot';
  /** One line, written for the user. */
  summary: string;
  framesTouched: string[];
  partsTouched: string[];
  cellsChanged: number;
  /** Cells of artwork that fell outside the canvas. */
  cellsLost: number;
  /** Non-empty when the migration refused: the project came back unchanged. */
  refusals: Fault[];
}

export interface Migration {
  project: PixelProject;
  report: MigrationReport;
}

const emptyReport = (kind: MigrationReport['kind'], summary: string): MigrationReport => ({
  kind,
  summary,
  framesTouched: [],
  partsTouched: [],
  cellsChanged: 0,
  cellsLost: 0,
  refusals: [],
});

/**
 * Change what a colour looks like.
 *
 * The safest migration there is: no cell changes its index, so no frame can
 * drift and nothing needs re-checking.
 */
export function retintIndex(project: PixelProject, index: number, hex: string): Migration {
  const colour = project.palette.colours[index];
  if (colour === undefined) {
    return refuse('retint', `there is no palette index ${index}`, [error('unknown-index', `the palette has no index ${index}`, { index })], project);
  }
  parseHex(hex);
  const colours = project.palette.colours.map((entry, at) => (at === index ? { ...entry, hex } : entry));
  return {
    project: { ...project, palette: { ...project.palette, colours } },
    report: { ...emptyReport('retint', `Index ${index} is now ${hex}. No pixels moved.`) },
  };
}

/** Add a colour. Safe by construction: no existing frame can become invalid. */
export function appendColour(project: PixelProject, colour: PaletteColour): Migration {
  parseHex(colour.hex);
  if (project.palette.colours.length >= MAX_PALETTE_SIZE) {
    return refuse(
      'append',
      `the palette already holds all ${MAX_PALETTE_SIZE} colours a grid can address`,
      [error('palette-size', `a project may hold ${MAX_PALETTE_SIZE} colours, because one cell is one character; remove one before adding another`)],
      project,
    );
  }
  return {
    project: { ...project, palette: { ...project.palette, colours: [...project.palette.colours, colour] } },
    report: emptyReport('append', `Added ${colour.name ?? colour.hex} as index ${project.palette.colours.length}.`),
  };
}

/**
 * Take colours out of the palette and remap what used them.
 *
 * Every cell of a removed colour becomes the nearest surviving colour, measured
 * in plain RGB distance, and the surviving indexes are renumbered to stay dense.
 * The report names every frame and part it rewrote, because "12 cells changed"
 * without saying where is not a report.
 */
export function removeIndexes(project: PixelProject, indexes: readonly number[]): Migration {
  const doomed = new Set(indexes.filter((index) => index !== TRANSPARENT_INDEX));
  if (indexes.includes(TRANSPARENT_INDEX)) {
    return refuse('remove', 'index 0 is transparent for the life of the project', [error('transparent-index', 'index 0 cannot be removed: it is transparent for the life of the project', { index: 0 })], project);
  }
  if (doomed.size === 0) return { project, report: emptyReport('remove', 'Nothing to remove.') };

  const survivors = project.palette.colours.map((_, index) => index).filter((index) => !doomed.has(index));
  const remap = new Map<number, number>();
  survivors.forEach((index, position) => remap.set(index, position));
  for (const index of doomed) remap.set(index, remap.get(nearestSurvivor(project, index, survivors)) ?? TRANSPARENT_INDEX);

  const migrated = rewriteIndexes(project, remap);
  const colours = survivors.map((index) => project.palette.colours[index]);
  const ramps = project.palette.ramps
    .map((ramp) => ({ ...ramp, indexes: ramp.indexes.filter((index) => !doomed.has(index)).map((index) => remap.get(index) ?? index) }))
    .filter((ramp) => ramp.indexes.length > 0);

  return {
    project: { ...migrated.project, palette: { colours, ramps } },
    report: {
      ...migrated.report,
      kind: 'remove',
      summary: `Removed ${doomed.size} colour${doomed.size === 1 ? '' : 's'} and remapped ${migrated.report.cellsChanged} cell${migrated.report.cellsChanged === 1 ? '' : 's'} to the nearest surviving colour.`,
    },
  };
}

/** The surviving colour closest in plain RGB distance. */
function nearestSurvivor(project: PixelProject, index: number, survivors: readonly number[]): number {
  const from = parseHex(project.palette.colours[index].hex);
  const candidates = survivors.filter((candidate) => candidate !== TRANSPARENT_INDEX);
  if (candidates.length === 0) return TRANSPARENT_INDEX;
  return candidates.reduce((best, candidate) => (distance(project, candidate, from) < distance(project, best, from) ? candidate : best));
}

function distance(project: PixelProject, index: number, to: readonly number[]): number {
  const colour = parseHex(project.palette.colours[index].hex);
  return colour.slice(0, 3).reduce((total, channel, at) => total + (channel - (to[at] ?? 0)) ** 2, 0);
}

/** Rewrite every stored index in the project through one table. */
function rewriteIndexes(project: PixelProject, remap: Map<number, number>): Migration {
  const paletteSize = project.palette.colours.length;
  const report = emptyReport('remove', '');
  const map = (index: number): number => remap.get(index) ?? index;

  const mapRows = (rows: readonly string[], size: Size, touched: () => void): string[] => {
    const { grid } = decodeGrid(rows, size.width, size.height, paletteSize);
    let changed = false;
    const next = grid.map((row) =>
      row.map((value) => {
        const mapped = map(value);
        if (mapped !== value) {
          changed = true;
          report.cellsChanged += 1;
        }
        return mapped;
      }),
    );
    if (changed) touched();
    return encodeGrid(next);
  };

  const parts = project.parts.map((part) => ({
    ...part,
    rows: mapRows(part.rows, part.size, () => report.partsTouched.push(part.id)),
    variants: part.variants.map((variant) => ({ ...variant, rows: mapRows(variant.rows, part.size, () => report.partsTouched.push(part.id)) })),
  }));

  const frames = project.frames.map((frame) => ({
    ...frame,
    rows: frame.rows === undefined ? undefined : mapRows(frame.rows, project.canvas, () => report.framesTouched.push(frame.id)),
    patch: frame.patch.map((cell) => mapCell(cell, map, report, frame.id)),
    locks: frame.locks.map((cell) => mapCell(cell, map, report, frame.id)),
  }));

  report.partsTouched = [...new Set(report.partsTouched)];
  report.framesTouched = [...new Set(report.framesTouched)];
  return { project: { ...project, parts, frames }, report };
}

function mapCell(cell: Cell, map: (index: number) => number, report: MigrationReport, frameId: string): Cell {
  const index = map(cell.index);
  if (index === cell.index) return cell;
  report.cellsChanged += 1;
  if (!report.framesTouched.includes(frameId)) report.framesTouched.push(frameId);
  return { ...cell, index };
}

export interface ResizeOptions {
  /**
   * Where the pivot sits on the new canvas. Content moves with it, so the pixel
   * under the pivot stays under the pivot. Defaults to the old pivot, held
   * inside the new canvas.
   */
  pivot?: Point;
  /** Go ahead even though hand-locked cells will be cut off. */
  allowClippingLocks?: boolean;
}

/**
 * Resize the canvas, re-anchoring everything on the pivot.
 *
 * Content is moved, never scaled: a resample by a fraction of a pixel is what
 * puts a seam across a character's hips (P6). Anything that falls outside is
 * counted and reported, and hand-locked cells stop the migration entirely unless
 * the user has said to go ahead.
 */
export function resizeCanvas(project: PixelProject, size: Size, options: ResizeOptions = {}): Migration {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1) {
    return refuse('resize', `${size.width}×${size.height} is not a canvas`, [error('canvas-size', `a canvas is a whole number of cells on each side, not ${size.width}×${size.height}`)], project);
  }
  if (size.width > MAX_CANVAS_SIDE || size.height > MAX_CANVAS_SIDE) {
    return refuse('resize', `${size.width}×${size.height} is past the canvas limit`, [error('canvas-size', `neither side of a canvas may exceed ${MAX_CANVAS_SIDE} cells`)], project);
  }

  const pivot = options.pivot ?? {
    x: Math.min(project.pivot.x, size.width - 1),
    y: Math.min(project.pivot.y, size.height - 1),
  };
  // A fractional pivot would shift every part by a fraction of a cell, which is
  // the one thing the engine never does (P6).
  if (!isWholePoint(pivot) || pivot.x < 0 || pivot.y < 0 || pivot.x >= size.width || pivot.y >= size.height) {
    return refuse(
      'resize',
      `${pivot.x},${pivot.y} is not a pivot on a ${size.width}×${size.height} canvas`,
      [error('pivot', `the pivot must be whole numbers inside the new ${size.width}×${size.height} canvas, not ${pivot.x},${pivot.y}`)],
      project,
    );
  }
  const dx = pivot.x - project.pivot.x;
  const dy = pivot.y - project.pivot.y;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < size.width && y < size.height;

  const clippedLocks = project.frames.flatMap((frame) => frame.locks.filter((lock) => !inside(lock.x + dx, lock.y + dy)).map((lock) => ({ frame, lock })));
  if (clippedLocks.length > 0 && options.allowClippingLocks !== true) {
    return refuse(
      'resize',
      `${clippedLocks.length} hand-drawn cell${clippedLocks.length === 1 ? '' : 's'} would be cut off`,
      clippedLocks.map(({ frame, lock }) =>
        error('lock-clipped', `resizing to ${size.width}×${size.height} would cut off the hand-drawn cell at ${lock.x},${lock.y} in frame "${frame.id}"`, {
          frameId: frame.id,
          x: lock.x,
          y: lock.y,
        }),
      ),
      project,
    );
  }

  const report = emptyReport('resize', '');
  const parts = project.parts.map((part) => resizePart(part, project, size, dx, dy, report)).filter((part): part is Part => part !== null);
  const kept = new Set(parts.map((part) => part.id));
  const frames = project.frames.map((frame) => {
    const rows = frame.rows === undefined ? undefined : shiftRows(frame.rows, project, size, dx, dy, report);
    // A placement of a part that no longer exists would fail structurally, so a
    // part cut off by the resize takes its placements with it.
    const placements = frame.placements.filter((placement) => kept.has(placement.partId));
    const patch = frame.patch.filter((cell) => keepCell(cell, dx, dy, inside, report));
    const locks = frame.locks.filter((cell) => keepCell(cell, dx, dy, inside, report));
    if (rows !== frame.rows || placements.length !== frame.placements.length || patch.length !== frame.patch.length || locks.length !== frame.locks.length) {
      report.framesTouched.push(frame.id);
    }
    return { ...frame, rows, placements, patch: patch.map((cell) => move(cell, dx, dy)), locks: locks.map((cell) => move(cell, dx, dy)) };
  });

  return {
    project: { ...project, canvas: size, pivot, parts, frames },
    report: {
      ...report,
      kind: 'resize',
      summary:
        report.cellsLost === 0
          ? `Canvas is now ${size.width}×${size.height}. Nothing was cut off.`
          : `Canvas is now ${size.width}×${size.height}. ${report.cellsLost} drawn cell${report.cellsLost === 1 ? '' : 's'} fell outside and were cut off.`,
      framesTouched: [...new Set(report.framesTouched)],
      partsTouched: [...new Set(report.partsTouched)],
    },
  };
}

const move = (cell: Cell, dx: number, dy: number): Cell => ({ ...cell, x: cell.x + dx, y: cell.y + dy });

function keepCell(cell: Cell, dx: number, dy: number, inside: (x: number, y: number) => boolean, report: MigrationReport): boolean {
  if (inside(cell.x + dx, cell.y + dy)) return true;
  if (cell.index !== TRANSPARENT_INDEX) report.cellsLost += 1;
  return false;
}

/**
 * A part keeps its own pixels; only the window it sits in moves and, if it must,
 * shrinks. A part left entirely outside the new canvas is gone, and says so.
 */
function resizePart(part: Part, project: PixelProject, size: Size, dx: number, dy: number, report: MigrationReport): Part | null {
  const left = part.origin.x + dx;
  const top = part.origin.y + dy;

  if (left >= size.width || top >= size.height || left + part.size.width <= 0 || top + part.size.height <= 0) {
    report.partsTouched.push(part.id);
    report.cellsLost += countFilled(decodeGrid(part.rows, part.size.width, part.size.height, project.palette.colours.length).grid);
    return null;
  }

  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  const width = Math.min(part.size.width - cropLeft, size.width - Math.max(0, left));
  const height = Math.min(part.size.height - cropTop, size.height - Math.max(0, top));

  if (cropLeft === 0 && cropTop === 0 && width === part.size.width && height === part.size.height) {
    return { ...part, origin: { x: left, y: top }, pivot: { x: part.pivot.x + dx, y: part.pivot.y + dy } };
  }
  report.partsTouched.push(part.id);

  const nextSize = { width: Math.max(1, width), height: Math.max(1, height) };
  const crop = (rows: readonly string[]): string[] => {
    const { grid } = decodeGrid(rows, part.size.width, part.size.height, project.palette.colours.length);
    report.cellsLost += countOutside(grid, cropLeft, cropTop, nextSize);
    return encodeGrid(
      Array.from({ length: nextSize.height }, (_, y) => Array.from({ length: nextSize.width }, (_, x) => grid[cropTop + y]?.[cropLeft + x] ?? TRANSPARENT_INDEX)),
    );
  };

  return {
    ...part,
    origin: { x: Math.max(0, left), y: Math.max(0, top) },
    size: nextSize,
    pivot: { x: part.pivot.x + dx, y: part.pivot.y + dy },
    rows: crop(part.rows),
    variants: part.variants.map((variant) => ({ ...variant, rows: crop(variant.rows) })),
  };
}

function countOutside(grid: Grid, cropLeft: number, cropTop: number, size: Size): number {
  let lost = 0;
  grid.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === TRANSPARENT_INDEX) return;
      const kept = x >= cropLeft && y >= cropTop && x < cropLeft + size.width && y < cropTop + size.height;
      if (!kept) lost += 1;
    }),
  );
  return lost;
}

function shiftRows(rows: readonly string[], project: PixelProject, size: Size, dx: number, dy: number, report: MigrationReport): string[] {
  const { grid } = decodeGrid(rows, project.canvas.width, project.canvas.height, project.palette.colours.length);
  const next = Array.from({ length: size.height }, (_, y) =>
    Array.from({ length: size.width }, (_, x) => grid[y - dy]?.[x - dx] ?? TRANSPARENT_INDEX),
  );
  grid.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === TRANSPARENT_INDEX) return;
      const kept = x + dx >= 0 && y + dy >= 0 && x + dx < size.width && y + dy < size.height;
      if (!kept) report.cellsLost += 1;
    }),
  );
  return encodeGrid(next);
}

/**
 * Move the pivot.
 *
 * Placements are absolute offsets from where a part was cut, so moving the pivot
 * cannot move a pixel — which is the guarantee, not an implementation detail.
 * The pivot is what export and alignment read, so it moves alone.
 */
export function movePivot(project: PixelProject, pivot: Point): Migration {
  if (!isWholePoint(pivot)) {
    return refuse('pivot', `${pivot.x},${pivot.y} is not a cell`, [error('pivot', `the pivot sits on a cell, so ${pivot.x},${pivot.y} must be whole numbers`)], project);
  }
  if (pivot.x < 0 || pivot.y < 0 || pivot.x >= project.canvas.width || pivot.y >= project.canvas.height) {
    return refuse('pivot', `${pivot.x},${pivot.y} is outside the canvas`, [error('pivot', `the pivot at ${pivot.x},${pivot.y} is outside the ${project.canvas.width}×${project.canvas.height} canvas`)], project);
  }
  return {
    project: { ...project, pivot },
    report: emptyReport('pivot', `The pivot is now at ${pivot.x},${pivot.y}. No pixels moved.`),
  };
}

const isWholePoint = (point: Point): boolean => Number.isInteger(point.x) && Number.isInteger(point.y);

function refuse(kind: MigrationReport['kind'], summary: string, refusals: Fault[], project: PixelProject): Migration {
  return { project, report: { ...emptyReport(kind, `Nothing changed: ${summary}.`), refusals } };
}
