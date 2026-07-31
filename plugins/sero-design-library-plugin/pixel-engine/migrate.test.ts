import { describe, expect, it } from 'vitest';

import { encodeGrid } from './grid';
import { appendColour, movePivot, removeIndexes, resizeCanvas, retintIndex } from './migrate';
import { resolveFrame } from './resolve';
import { knightProject } from './testing/fixtures';
import { validateProject } from './validate';

describe('re-tinting a colour', () => {
  it('changes the colour and nothing else', () => {
    const before = knightProject();
    const { project, report } = retintIndex(before, 4, '#ff0000');
    expect(project.palette.colours[4].hex).toBe('#ff0000');
    expect(encodeGrid(resolveFrame(project, project.frames[0]))).toEqual(encodeGrid(resolveFrame(before, before.frames[0])));
    expect(report.cellsChanged).toBe(0);
    expect(report.summary).toContain('No pixels moved');
  });

  it('refuses an index the palette does not have', () => {
    const { project, report } = retintIndex(knightProject(), 9, '#ff0000');
    expect(report.refusals).toHaveLength(1);
    expect(project.palette.colours).toHaveLength(6);
  });

  it('refuses something that is not a colour', () => {
    expect(() => retintIndex(knightProject(), 4, 'red')).toThrow();
  });
});

describe('appending a colour', () => {
  it('cannot invalidate an existing frame', () => {
    const { project } = appendColour(knightProject(), { hex: '#00ff88', name: 'poison' });
    expect(project.palette.colours).toHaveLength(7);
    expect(validateProject(project).ok).toBe(true);
  });
});

describe('removing a colour', () => {
  it('remaps every cell to the nearest surviving colour and renumbers the rest', () => {
    const before = knightProject();
    // Index 3 is the tunic shadow; index 4 is the tunic it shades.
    const { project, report } = removeIndexes(before, [3]);
    expect(project.palette.colours.map((colour) => colour.name)).toEqual(['transparent', 'outline', 'skin', 'tunic', 'leather']);
    expect(report.cellsChanged).toBeGreaterThan(0);
    expect(report.partsTouched).toContain('body');
    expect(report.summary).toContain('nearest surviving colour');
    expect(validateProject(project).ok).toBe(true);
  });

  it('leaves the project valid, with no cell pointing past the palette', () => {
    const { project } = removeIndexes(knightProject(), [5]);
    const grid = resolveFrame(project, project.frames[0]);
    expect(Math.max(...grid.flat())).toBeLessThan(project.palette.colours.length);
  });

  it('drops a ramp that lost every colour it named', () => {
    const { project } = removeIndexes(knightProject(), [3, 4]);
    expect(project.palette.ramps).toEqual([]);
  });

  it('refuses to remove the transparent index', () => {
    const { project, report } = removeIndexes(knightProject(), [0]);
    expect(report.refusals[0].code).toBe('transparent-index');
    expect(project.palette.colours).toHaveLength(6);
  });
});

describe('resizing the canvas', () => {
  it('re-anchors the artwork on the pivot', () => {
    const before = knightProject();
    // A taller canvas with the pivot moved to its new bottom: the character keeps
    // its feet on the floor and gains room above its head.
    const { project, report } = resizeCanvas(before, { width: 12, height: 24 }, { pivot: { x: 6, y: 23 } });
    expect(project.canvas).toEqual({ width: 12, height: 24 });
    expect(report.cellsLost).toBe(0);
    const grid = resolveFrame(project, project.frames[0]);
    const original = resolveFrame(before, before.frames[0]);
    expect(encodeGrid(grid).slice(8)).toEqual(encodeGrid(original));
    expect(validateProject(project).ok).toBe(true);
  });

  it('reports the artwork it had to cut off', () => {
    const { project, report } = resizeCanvas(knightProject(), { width: 8, height: 16 });
    expect(report.cellsLost).toBeGreaterThan(0);
    expect(report.summary).toContain('cut off');
    expect(project.canvas).toEqual({ width: 8, height: 16 });
    expect(validateProject(project).faults.filter((fault) => fault.code === 'part-bounds')).toEqual([]);
  });

  it('refuses to cut off a cell the user drew by hand', () => {
    const before = knightProject();
    before.frames[0].locks.push({ x: 11, y: 9, index: 5 });
    const { project, report } = resizeCanvas(before, { width: 8, height: 16 });
    expect(report.refusals[0].code).toBe('lock-clipped');
    expect(report.refusals[0].message).toContain('11,9');
    expect(project.canvas).toEqual({ width: 12, height: 16 });
  });

  it('goes ahead when the user has said so', () => {
    const before = knightProject();
    before.frames[0].locks.push({ x: 11, y: 9, index: 5 });
    const { project, report } = resizeCanvas(before, { width: 8, height: 16 }, { allowClippingLocks: true });
    expect(report.refusals).toEqual([]);
    expect(project.frames[0].locks).toEqual([]);
  });

  it('refuses a canvas that is not a whole number of cells', () => {
    const { report } = resizeCanvas(knightProject(), { width: 12.5, height: 16 });
    expect(report.refusals[0].code).toBe('canvas-size');
  });
});

/**
 * A migration that returns a project the validator then rejects has moved the
 * fault rather than fixed it, so the guarantee is checked as one rule over all
 * of them rather than remembered case by case.
 */
describe('a migration that succeeds always returns a valid project', () => {
  const migrations: [string, () => ReturnType<typeof retintIndex>][] = [
    ['retint', () => retintIndex(knightProject(), 4, '#ff0000')],
    ['append', () => appendColour(knightProject(), { hex: '#00ff88', name: 'poison' })],
    ['remove one', () => removeIndexes(knightProject(), [3])],
    ['remove two', () => removeIndexes(knightProject(), [3, 4])],
    ['grow', () => resizeCanvas(knightProject(), { width: 16, height: 24 }, { pivot: { x: 8, y: 23 } })],
    ['shrink', () => resizeCanvas(knightProject(), { width: 8, height: 16 })],
    ['move the pivot', () => movePivot(knightProject(), { x: 2, y: 2 })],
  ];

  it.each(migrations)('%s', (_name, run) => {
    const { project, report } = run();
    expect(report.refusals).toEqual([]);
    expect(validateProject(project).faults.filter((fault) => fault.severity === 'error')).toEqual([]);
  });
});

describe('a migration refuses rather than returning something invalid', () => {
  it('will not push the palette past what one character can address', () => {
    let project = knightProject();
    while (project.palette.colours.length < 32) project = appendColour(project, { hex: '#123456' }).project;
    const { report, project: after } = appendColour(project, { hex: '#654321' });
    expect(report.refusals[0].code).toBe('palette-size');
    expect(after.palette.colours).toHaveLength(32);
  });

  it('will not resize past the canvas limit', () => {
    expect(resizeCanvas(knightProject(), { width: 4096, height: 16 }).report.refusals[0].code).toBe('canvas-size');
  });

  it('will not take a fractional pivot, which would shift every part by half a cell', () => {
    expect(resizeCanvas(knightProject(), { width: 16, height: 16 }, { pivot: { x: 6.5, y: 15 } }).report.refusals[0].code).toBe('pivot');
    expect(movePivot(knightProject(), { x: 2.5, y: 2 }).report.refusals[0].code).toBe('pivot');
  });
});

describe('moving the pivot', () => {
  it('moves no pixels, because placements are absolute', () => {
    const before = knightProject();
    const { project } = movePivot(before, { x: 2, y: 2 });
    expect(project.pivot).toEqual({ x: 2, y: 2 });
    expect(encodeGrid(resolveFrame(project, project.frames[1]))).toEqual(encodeGrid(resolveFrame(before, before.frames[1])));
  });

  it('refuses a pivot outside the canvas', () => {
    const { report } = movePivot(knightProject(), { x: 40, y: 2 });
    expect(report.refusals[0].code).toBe('pivot');
  });
});
