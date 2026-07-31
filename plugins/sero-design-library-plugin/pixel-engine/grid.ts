/**
 * The rows-of-characters codec (P1, P3).
 *
 * A grid is stored and transmitted as one line of text per row, one character
 * per cell, each character a palette index in base 32. A 64×64 frame is about
 * 4 KB of text: small enough to diff, cheap enough to hand to a model, and — the
 * property that matters most — a shape a model can hold. Run-length encoding was
 * measured and rejected: 1052 characters against 1121 raw on detailed art, for
 * an extra failure mode where the runs must sum to the row width.
 *
 * Base 32 rather than hex because a palette holds up to 32 colours (spec §4) and
 * one cell must stay one character; a two-character cell doubles the text and
 * lets a row be half-written.
 */

import { error, type Fault } from './fault';

/** A decoded grid: `grid[y][x]` is a palette index. */
export type Grid = number[][];

/** A grid in its stored form: one string per row. */
export type GridRows = readonly string[];

/** Index 0 … 31, in order. Lower case; decoding accepts either case. */
export const GRID_ALPHABET = '0123456789abcdefghijklmnopqrstuv';

/** The largest palette one character per cell can address. */
export const MAX_PALETTE_SIZE = GRID_ALPHABET.length;

/** Index 0 is transparent for the life of a project (P10). */
export const TRANSPARENT_INDEX = 0;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function indexToChar(index: number): string {
  const char = GRID_ALPHABET[index];
  if (char === undefined) throw new Error(`palette index ${index} is outside 0…${MAX_PALETTE_SIZE - 1}`);
  return char;
}

/** The index a character means, or -1 when it means nothing. */
export function charToIndex(char: string): number {
  return GRID_ALPHABET.indexOf(char.toLowerCase());
}

export function blankGrid(width: number, height: number): Grid {
  return Array.from({ length: height }, () => new Array<number>(width).fill(TRANSPARENT_INDEX));
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

export function gridEquals(a: Grid, b: Grid): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, y) => row.length === b[y].length && row.every((value, x) => value === b[y][x]));
}

export function encodeGrid(grid: Grid): string[] {
  return grid.map((row) => row.map(indexToChar).join(''));
}

export interface DecodeResult {
  /** Always exactly `width` × `height`. Anything missing or unreadable is transparent. */
  grid: Grid;
  faults: Fault[];
}

/**
 * Text back to a grid, reporting rather than throwing.
 *
 * The result is always the full canvas size even when the text was wrong, so a
 * caller repairing model output has something to render and compare against.
 * Case is forgiving: an upper-case `A` can only mean index 10, so rejecting it
 * would cost a repair round trip to change nothing.
 */
export function decodeGrid(rows: GridRows, width: number, height: number, paletteSize: number): DecodeResult {
  const faults: Fault[] = [];
  const grid = blankGrid(width, height);

  if (rows.length !== height) {
    faults.push(
      error('row-count', `the grid has ${rows.length} rows, the canvas is ${height} rows tall — write exactly ${height}`),
    );
  }

  rows.forEach((row, y) => {
    const cells = [...row.trim()];
    if (y >= height) return;
    if (cells.length !== width) {
      faults.push(
        error(
          'row-length',
          `row ${y} has ${cells.length} cells, the canvas is ${width} wide — write exactly ${width} characters`,
          { y },
        ),
      );
    }
    cells.slice(0, width).forEach((char, x) => {
      const index = charToIndex(char);
      if (index < 0) {
        faults.push(error('bad-character', `row ${y} column ${x}: "${char}" is not a palette character`, { x, y }));
        return;
      }
      if (index >= paletteSize) {
        faults.push(
          error('index-outside-palette', `row ${y} column ${x}: index ${index} but the palette holds ${paletteSize} colours`, {
            x,
            y,
            index,
          }),
        );
        return;
      }
      grid[y][x] = index;
    });
  });

  return { grid, faults };
}

/** The box around every non-transparent cell, or null when the grid is empty. */
export function boundingBox(grid: Grid): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  grid.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === TRANSPARENT_INDEX) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }),
  );
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function countFilled(grid: Grid): number {
  return grid.reduce((total, row) => total + row.reduce((n, value) => (value === TRANSPARENT_INDEX ? n : n + 1), 0), 0);
}

/** Mirror about the grid's own vertical centre. */
export function flipGridX(grid: Grid): Grid {
  return grid.map((row) => [...row].reverse());
}

/** Read a cell that may be outside the grid; outside is transparent. */
export function cellAt(grid: Grid, x: number, y: number): number {
  const row = grid[y];
  if (row === undefined) return TRANSPARENT_INDEX;
  const value = row[x];
  return value === undefined ? TRANSPARENT_INDEX : value;
}
