import { describe, expect, it } from 'vitest';

import { TRANSPARENT } from '../../engine/types';
import {
  MAX_UNDO,
  cellAt,
  cellFromPointer,
  commit,
  fill,
  paint,
  redo,
  undo,
  EMPTY_HISTORY,
  type EditState,
  type EditableGrid,
} from './pixel-edit';

/**
 * The frame editor's data.
 *
 * The editor writes palette indexes, never colours, so what is asserted here is
 * that every operation puts an index in a cell and nothing else. The undo stack
 * is a list of grids, so a step that changed nothing must not become a step.
 */

function grid(cells: number[], cols = 3): EditableGrid {
  return { cols, rows: cells.length / cols, cells };
}

const FLAT = grid([0, 0, 0, 0, 1, 0, 0, 0, 0]);

describe('painting one cell', () => {
  it('leaves every other cell alone', () => {
    const next = paint(FLAT, 0, 0, 2);
    expect(next.cells).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(FLAT.cells[0]).toBe(0);
  });

  it('hands back the same grid when nothing changed, so a drag is one step', () => {
    expect(paint(FLAT, 1, 1, 1)).toBe(FLAT);
    expect(paint(FLAT, -1, 0, 2)).toBe(FLAT);
    expect(paint(FLAT, 9, 9, 2)).toBe(FLAT);
  });

  it('erases to transparent rather than to a colour', () => {
    expect(paint(FLAT, 1, 1, TRANSPARENT).cells[4]).toBe(TRANSPARENT);
  });
});

describe('filling', () => {
  it('takes every cell joined to the one clicked that shares its colour', () => {
    const next = fill(FLAT, 0, 0, 5);
    expect(next.cells).toEqual([5, 5, 5, 5, 1, 5, 5, 5, 5]);
  });

  it('stops at a different colour', () => {
    const split = grid([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    expect(fill(split, 0, 0, 5).cells).toEqual([5, 1, 0, 5, 1, 0, 5, 1, 0]);
  });

  it('does nothing when the cell is already that colour', () => {
    expect(fill(FLAT, 0, 0, 0)).toBe(FLAT);
  });

  it('handles a large flat region without running out of stack', () => {
    const big = { cols: 200, rows: 200, cells: Array.from({ length: 40_000 }, () => 0) };
    expect(fill(big, 0, 0, 3).cells.every((cell) => cell === 3)).toBe(true);
  });
});

describe('undo', () => {
  const start: EditState = { grid: FLAT, history: EMPTY_HISTORY };

  it('goes back to the grid before the change, and forward again', () => {
    const painted = commit(start, paint(FLAT, 0, 0, 2));
    expect(painted.grid.cells[0]).toBe(2);

    const back = undo(painted);
    expect(back.grid).toBe(FLAT);

    const forward = redo(back);
    expect(forward.grid.cells[0]).toBe(2);
  });

  it('does not record a change that changed nothing', () => {
    expect(commit(start, FLAT)).toBe(start);
  });

  it('drops the redo branch once a fresh edit is made', () => {
    const painted = commit(start, paint(FLAT, 0, 0, 2));
    const back = undo(painted);
    const elsewhere = commit(back, paint(back.grid, 2, 2, 3));
    expect(elsewhere.history.future).toEqual([]);
    expect(redo(elsewhere)).toBe(elsewhere);
  });

  it('stops at nothing to undo', () => {
    expect(undo(start)).toBe(start);
  });

  it('holds a bounded amount of history', () => {
    let state = start;
    for (let step = 0; step < MAX_UNDO + 10; step += 1) {
      state = commit(state, paint(state.grid, step % 3, Math.floor(step / 3) % 3, step + 2));
    }
    expect(state.history.past.length).toBe(MAX_UNDO);
  });
});

describe('finding the cell under the pointer', () => {
  const bounds = { left: 100, top: 50, width: 30, height: 30 };

  it('maps page coordinates onto the grid', () => {
    expect(cellFromPointer(FLAT, bounds, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(cellFromPointer(FLAT, bounds, 115, 65)).toEqual({ x: 1, y: 1 });
    expect(cellFromPointer(FLAT, bounds, 129, 79)).toEqual({ x: 2, y: 2 });
  });

  it('reports nothing outside the artwork', () => {
    expect(cellFromPointer(FLAT, bounds, 99, 50)).toBeNull();
    expect(cellFromPointer(FLAT, bounds, 131, 50)).toBeNull();
    expect(cellFromPointer(FLAT, { ...bounds, width: 0 }, 100, 50)).toBeNull();
  });
});

describe('reading a cell', () => {
  it('is transparent outside the grid, so the eyedropper cannot pick a colour that is not there', () => {
    expect(cellAt(FLAT, 1, 1)).toBe(1);
    expect(cellAt(FLAT, -1, 0)).toBe(TRANSPARENT);
  });
});
