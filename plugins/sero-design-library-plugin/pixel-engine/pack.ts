/**
 * Frames laid out into one sheet (spec §9).
 *
 * One row per clip, one cell per frame, at a fixed cell size — the layout every
 * engine's importer expects, and the one a human can read at a glance.
 *
 * Packing works on index grids rather than on pixels, so the sheet is rendered
 * once at the end from the same palette as everything else. That is what keeps a
 * frame in the sheet and the same frame on the canvas byte-identical.
 *
 * `extrude` is the option that earns its keep. A game engine sampling a sheet at
 * a non-integer zoom reads a fraction of a pixel past the edge of a frame, and
 * picks up whatever is next to it. Repeating each frame's edge cells into a ring
 * around it means what it picks up is the frame's own edge.
 */

import { blankGrid, cellAt, type Grid } from './grid';

export interface PackRow {
  /** The clip this row holds, or `base` for frames that belong to no clip. */
  name: string;
  frames: Grid[];
}

export interface PackOptions {
  /** Transparent cells between one frame's cell and the next. */
  padding?: number;
  /** Edge cells repeated around each frame, inside the padding. */
  extrude?: number;
}

export interface PackedFrame {
  /** Which row this came from. Clip *names* are not unique; this is. */
  rowIndex: number;
  row: string;
  /** Where this frame sits in its row. */
  index: number;
  /** The frame's own pixels — the extruded ring is outside this box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackedSheet {
  grid: Grid;
  width: number;
  height: number;
  frames: PackedFrame[];
}

export function packSheet(rows: readonly PackRow[], options: PackOptions = {}): PackedSheet {
  const padding = options.padding ?? 0;
  const extrude = options.extrude ?? 0;
  if (!Number.isInteger(padding) || padding < 0) throw new Error(`padding ${padding} is not a whole number of cells`);
  if (!Number.isInteger(extrude) || extrude < 0) throw new Error(`extrude ${extrude} is not a whole number of cells`);

  const cellWidth = Math.max(0, ...rows.flatMap((row) => row.frames.map((frame) => frame[0]?.length ?? 0)));
  const cellHeight = Math.max(0, ...rows.flatMap((row) => row.frames.map((frame) => frame.length)));
  const stepX = cellWidth + extrude * 2 + padding;
  const stepY = cellHeight + extrude * 2 + padding;
  const columns = Math.max(0, ...rows.map((row) => row.frames.length));

  // The trailing padding of the last cell in each direction is not part of the
  // sheet: a border of empty cells is wasted space in every engine that reads it.
  const width = columns === 0 ? 0 : columns * stepX - padding;
  const height = rows.length === 0 ? 0 : rows.length * stepY - padding;
  const grid = blankGrid(width, height);
  const frames: PackedFrame[] = [];

  rows.forEach((row, rowIndex) => {
    row.frames.forEach((frame, frameIndex) => {
      const left = frameIndex * stepX + extrude;
      const top = rowIndex * stepY + extrude;
      blit(grid, frame, left, top);
      if (extrude > 0) extrudeEdges(grid, frame, left, top, extrude);
      frames.push({ rowIndex, row: row.name, index: frameIndex, x: left, y: top, width: cellWidth, height: cellHeight });
    });
  });

  return { grid, width, height, frames };
}

function blit(sheet: Grid, frame: Grid, left: number, top: number): void {
  frame.forEach((row, y) =>
    row.forEach((value, x) => {
      const target = sheet[top + y];
      if (target !== undefined && left + x < target.length) target[left + x] = value;
    }),
  );
}

/** Repeat the frame's edge cells outwards, clamping at its corners. */
function extrudeEdges(sheet: Grid, frame: Grid, left: number, top: number, extrude: number): void {
  const width = frame[0]?.length ?? 0;
  const height = frame.length;
  for (let y = -extrude; y < height + extrude; y += 1) {
    for (let x = -extrude; x < width + extrude; x += 1) {
      if (x >= 0 && y >= 0 && x < width && y < height) continue;
      const nearestX = Math.min(width - 1, Math.max(0, x));
      const nearestY = Math.min(height - 1, Math.max(0, y));
      const target = sheet[top + y];
      if (target !== undefined && left + x >= 0 && left + x < target.length) target[left + x] = cellAt(frame, nearestX, nearestY);
    }
  }
}
