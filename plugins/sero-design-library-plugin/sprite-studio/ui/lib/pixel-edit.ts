/**
 * The frame editor's data (spec §6.2).
 *
 * Cells hold palette *indexes*, never colours. That is the whole point: colours
 * come from the character's palette and nowhere else, so a hand edit cannot
 * break the thing the rest of the pipeline works to guarantee. A tool that
 * could write an arbitrary colour would need a check downstream to undo it.
 *
 * Grids are treated as immutable so undo is a list of them rather than a list
 * of inverse operations — a few tens of kilobytes each, and no way for an undo
 * to be wrong.
 */

import type { AppTools } from '@sero-ai/app-runtime';

import { TRANSPARENT } from '../../engine/types';
import { newSpriteId, sendRequest, stageFile } from './requests';

export interface EditableGrid {
  cols: number;
  rows: number;
  /** One palette index per cell, `TRANSPARENT` where nothing is drawn. */
  cells: number[];
}

/** Far enough back to undo a slip, short of holding a whole session in memory. */
export const MAX_UNDO = 40;

export function inside(grid: EditableGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.cols && y < grid.rows;
}

export function cellAt(grid: EditableGrid, x: number, y: number): number {
  return inside(grid, x, y) ? (grid.cells[y * grid.cols + x] ?? TRANSPARENT) : TRANSPARENT;
}

/**
 * One cell.
 *
 * The same grid comes back when nothing changed, so dragging the pencil across
 * a cell it has already painted does not push another undo step.
 */
export function paint(grid: EditableGrid, x: number, y: number, value: number): EditableGrid {
  if (!inside(grid, x, y) || cellAt(grid, x, y) === value) return grid;
  const cells = [...grid.cells];
  cells[y * grid.cols + x] = value;
  return { ...grid, cells };
}

/** Every cell joined to this one that shares its colour. */
export function fill(grid: EditableGrid, x: number, y: number, value: number): EditableGrid {
  if (!inside(grid, x, y)) return grid;
  const target = cellAt(grid, x, y);
  if (target === value) return grid;

  const cells = [...grid.cells];
  // A stack rather than recursion: a large flat region is thousands of cells
  // deep, and that is a blown call stack rather than a slow fill.
  const stack: number[] = [y * grid.cols + x];
  while (stack.length > 0) {
    const at = stack.pop();
    if (at === undefined || cells[at] !== target) continue;
    cells[at] = value;
    const col = at % grid.cols;
    const row = Math.floor(at / grid.cols);
    if (col > 0) stack.push(at - 1);
    if (col + 1 < grid.cols) stack.push(at + 1);
    if (row > 0) stack.push(at - grid.cols);
    if (row + 1 < grid.rows) stack.push(at + grid.cols);
  }
  return { ...grid, cells };
}

export interface EditHistory {
  /** Oldest first. The current grid is not in here. */
  past: EditableGrid[];
  future: EditableGrid[];
}

export const EMPTY_HISTORY: EditHistory = { past: [], future: [] };

export interface EditState {
  grid: EditableGrid;
  history: EditHistory;
}

/** Record a change. A change that changed nothing is not one. */
export function commit(state: EditState, next: EditableGrid): EditState {
  if (next === state.grid) return state;
  return {
    grid: next,
    // Redo is dropped on a fresh edit: the branch it led to no longer exists.
    history: { past: [...state.history.past, state.grid].slice(-MAX_UNDO), future: [] },
  };
}

export function undo(state: EditState): EditState {
  const previous = state.history.past.at(-1);
  if (previous === undefined) return state;
  return {
    grid: previous,
    history: {
      past: state.history.past.slice(0, -1),
      future: [state.grid, ...state.history.future],
    },
  };
}

export function redo(state: EditState): EditState {
  const [next, ...rest] = state.history.future;
  if (next === undefined) return state;
  return {
    grid: next,
    history: { past: [...state.history.past, state.grid].slice(-MAX_UNDO), future: rest },
  };
}

/** Which cell a pointer at these page coordinates is over. */
export function cellFromPointer(
  grid: EditableGrid,
  bounds: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const x = Math.floor(((clientX - bounds.left) / bounds.width) * grid.cols);
  const y = Math.floor(((clientY - bounds.top) / bounds.height) * grid.rows);
  return inside(grid, x, y) ? { x, y } : null;
}

function rgbaOf(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16) || 0,
    Number.parseInt(value.slice(2, 4), 16) || 0,
    Number.parseInt(value.slice(4, 6), 16) || 0,
  ];
}

/**
 * The edited grid as a PNG, one file pixel per art pixel.
 *
 * Every pixel is either fully transparent or exactly a palette entry, so the
 * runtime's read back onto indexes is exact rather than a re-quantise.
 */
export async function gridToPng(grid: EditableGrid, palette: string[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This renderer has no 2D canvas.');

  const image = context.createImageData(grid.cols, grid.rows);
  const colours = palette.map(rgbaOf);
  for (let at = 0; at < grid.cols * grid.rows; at += 1) {
    const index = grid.cells[at] ?? TRANSPARENT;
    const colour = index === TRANSPARENT ? undefined : colours[index];
    if (colour === undefined) continue;
    image.data[at * 4] = colour[0];
    image.data[at * 4 + 1] = colour[1];
    image.data[at * 4 + 2] = colour[2];
    image.data[at * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('The canvas produced no image.')) : resolve(blob)),
      'image/png',
    );
  });
}

/** Stage the edited frame and ask the runtime to take it. */
export async function writeFrameGrid(
  tools: AppTools,
  animationId: string,
  frameId: string,
  grid: EditableGrid,
  palette: string[],
): Promise<void> {
  const png = await gridToPng(grid, palette);
  const stagingKey = newSpriteId('edit');
  await stageFile(tools, stagingKey, '000', new Uint8Array(await png.arrayBuffer()));
  await sendRequest(tools, { kind: 'sprite.frame.write', animationId, frameId, stagingKey });
}
