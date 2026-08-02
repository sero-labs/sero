/**
 * The bind-pose gate. Its whole value is that it FAILS when the pieces land
 * somewhere other than where they were cut, so most of this file is about
 * proving it does, and that it is not quietly forgiving the two things the
 * engine changes on purpose.
 */
import { describe, expect, it } from 'vitest';
import { Img } from '@sero-ai/ink-and-bones';

import type { CellGrid, Palette } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';
import { bindPose, gradedTarget } from './rig-gate';

const PALETTE: Palette = [
  [200, 60, 60],
  [60, 90, 200],
];

function boxGrid(): CellGrid {
  const cells = new Int16Array(20 * 20).fill(TRANSPARENT);
  for (let y = 4; y < 14; y++) for (let x = 4; x < 14; x++) cells[y * 20 + x] = 0;
  return { cols: 20, rows: 20, cells };
}

/** The picture as a baked frame would carry it, optionally shifted. */
function asFrame(grid: CellGrid, palette: Palette, dx = 0, dy = 0): Img {
  const img = new Img(grid.cols, grid.rows);
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[(y - dy) * grid.cols + (x - dx)];
      if (cell === undefined || cell < 0) continue;
      const rgb = palette[cell];
      img.set(x, y, [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1]);
    }
  }
  return img;
}

describe('gradedTarget', () => {
  it('says how much of the reference the despeckle rule costs', () => {
    const grid = boxGrid();
    // One lone pixel of the other colour, which the grade rule destroys.
    grid.cells[9 * 20 + 9] = 1;
    const graded = gradedTarget(grid, PALETTE);
    expect(graded.changed).toBe(1);
    expect(graded.img.alpha(9, 9)).toBeGreaterThan(0.5);
  });

  it('leaves flat artwork alone', () => {
    expect(gradedTarget(boxGrid(), PALETTE).changed).toBe(0);
  });
});

describe('bindPose', () => {
  it('passes when the rest frame is the picture', () => {
    const grid = boxGrid();
    const report = bindPose(asFrame(grid, PALETTE), grid, PALETTE);
    expect(report.ok).toBe(true);
    expect(report.differ).toBe(0);
    expect(report.cells).toBe(100);
  });

  it('fails when the pieces land one pixel out', () => {
    const grid = boxGrid();
    const report = bindPose(asFrame(grid, PALETTE, 1, 0), grid, PALETTE);
    expect(report.ok).toBe(false);
    expect(report.missing).toBe(10);
    expect(report.text).toContain('not landing where they were cut');
  });

  it('does not charge the rig for the ink ring the engine adds', () => {
    // The grade lays a 1px silhouette outline outside the figure. Those cells
    // are not in the target, and counting them would make an exact rig fail.
    const grid = boxGrid();
    const frame = asFrame(grid, PALETTE);
    for (let x = 3; x < 15; x++) frame.set(x, 3, [0, 0, 0, 1]);
    expect(bindPose(frame, grid, PALETTE).ok).toBe(true);
  });

  it('reports a wrong colour as loudly as a missing pixel', () => {
    const grid = boxGrid();
    const frame = asFrame(grid, PALETTE);
    for (let y = 4; y < 14; y++) frame.set(4, y, [60 / 255, 90 / 255, 200 / 255, 1]);
    const report = bindPose(frame, grid, PALETTE);
    expect(report.differ).toBe(10);
    expect(report.missing).toBe(0);
    expect(report.ok).toBe(false);
  });

  it('refuses an empty target rather than passing it vacuously', () => {
    const empty: CellGrid = { cols: 8, rows: 8, cells: new Int16Array(64).fill(TRANSPARENT) };
    const report = bindPose(new Img(8, 8), empty, PALETTE);
    expect(report.ok).toBe(false);
    expect(report.text).toContain('nothing to rig');
  });
});
