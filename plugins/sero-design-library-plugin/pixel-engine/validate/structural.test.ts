/**
 * One fixture per fault class, each built to fail exactly that check (plan §8).
 */

import { describe, expect, it } from 'vitest';

import type { PixelProject } from '../schema';
import { knightProject } from '../testing/fixtures';
import { validateStructure } from './structural';

/** The fault codes a project raises. */
function codes(project: PixelProject): string[] {
  return validateStructure(project).map((fault) => fault.code);
}

/** A knight with one thing broken. */
function broken(mutate: (project: PixelProject) => void): PixelProject {
  const project = knightProject();
  mutate(project);
  return project;
}

it('passes a well-formed project', () => {
  expect(validateStructure(knightProject())).toEqual([]);
});

describe('the canvas', () => {
  it('rejects a fractional side', () => {
    expect(codes(broken((project) => (project.canvas = { width: 12.5, height: 16 })))).toContain('canvas-size');
  });

  it('rejects a canvas bigger than the cap', () => {
    expect(codes(broken((project) => (project.canvas = { width: 4096, height: 16 })))).toContain('canvas-size');
  });

  it('rejects a pivot outside the canvas', () => {
    expect(codes(broken((project) => (project.pivot = { x: 40, y: 2 })))).toContain('pivot');
  });
});

describe('the palette', () => {
  it('rejects more colours than one character can address', () => {
    expect(codes(broken((project) => (project.palette.colours = Array.from({ length: 33 }, () => ({ hex: '#112233' })))))).toContain('palette-size');
  });

  it('rejects a colour that is not a hex colour', () => {
    expect(codes(broken((project) => (project.palette.colours[2] = { hex: 'skin' })))).toContain('palette-colour');
  });

  it('rejects a ramp that names a colour the palette does not have', () => {
    expect(codes(broken((project) => (project.palette.ramps[0].indexes = [3, 9])))).toContain('ramp-index');
  });

  it('rejects a ramp that includes the transparent index', () => {
    expect(codes(broken((project) => (project.palette.ramps[0].indexes = [0, 3])))).toContain('ramp-index');
  });

  it('rejects a ramp step that is not a palette index at all', () => {
    expect(codes(broken((project) => (project.palette.ramps[0].indexes = [3, 3.5])))).toContain('ramp-index');
  });
});

/**
 * The validator is the one place that must never throw: it is what stands
 * between a model's output and the rest of the engine, and an exception there is
 * a crash rather than a fault a run can repair.
 */
describe('the validator itself never throws', () => {
  const hostile: [string, (project: PixelProject) => void][] = [
    ['a fractional canvas with a drawn frame', (project) => { project.canvas = { width: 12.5, height: 16 }; project.frames[0].rows = Array.from({ length: 16 }, () => '000000000000'); }],
    ['a canvas of zero', (project) => (project.canvas = { width: 0, height: 0 })],
    ['a canvas that is not a number', (project) => (project.canvas = { width: Number.NaN, height: 16 })],
    ['no palette at all', (project) => (project.palette = { colours: [], ramps: [] })],
    ['a part claiming a million cells', (project) => (project.parts[0].size = { width: 1_000_000, height: 1_000_000 })],
    ['a fractional part origin', (project) => (project.parts[0].origin = { x: 0.5, y: 0 })],
    ['a fractional part pivot', (project) => (project.parts[0].pivot = { x: 0.5, y: 0 })],
    ['no frames, parts or clips', (project) => { project.frames = []; project.parts = []; project.clips = []; }],
  ];

  it.each(hostile)('survives %s', (_name, mutate) => {
    expect(() => validateStructure(broken(mutate))).not.toThrow();
  });
});

describe('grids', () => {
  it('rejects a row of the wrong length', () => {
    const faults = validateStructure(broken((project) => (project.parts[0].rows = [...project.parts[0].rows.slice(1), '00'])));
    expect(faults.map((fault) => fault.code)).toContain('row-length');
    expect(faults[0].message).toContain('part "head"');
  });

  it('rejects an index the palette does not have', () => {
    expect(codes(broken((project) => (project.parts[0].rows = project.parts[0].rows.map((row) => row.replace('1', '9')))))).toContain('index-outside-palette');
  });

  it('rejects a character that is not a palette character at all', () => {
    expect(codes(broken((project) => (project.parts[0].rows = project.parts[0].rows.map((row) => row.replace('1', 'z')))))).toContain('bad-character');
  });

  it('rejects a variant that is not the size of the part it belongs to', () => {
    expect(codes(broken((project) => project.parts[0].variants.push({ id: 'shout', rows: ['00', '00'] })))).toContain('row-count');
  });

  it('rejects a frame grid that is not the size of the canvas', () => {
    expect(codes(broken((project) => (project.frames[0].rows = ['000'])))).toContain('row-count');
  });
});

describe('parts', () => {
  it('rejects a cut that reaches outside the canvas', () => {
    expect(codes(broken((project) => (project.parts[0].origin = { x: 8, y: 0 })))).toContain('part-bounds');
  });

  it('rejects two parts with the same id', () => {
    expect(codes(broken((project) => project.parts.push({ ...project.parts[0] })))).toContain('duplicate-id');
  });
});

describe('placements', () => {
  it('reject a part the project does not have', () => {
    expect(codes(broken((project) => (project.frames[0].placements[0].partId = 'wing')))).toContain('unknown-part');
  });

  it('reject a variant the part does not have', () => {
    expect(codes(broken((project) => (project.frames[0].placements[0].variantId = 'kick')))).toContain('unknown-variant');
  });

  it('reject a fractional offset, because a pixel cannot move half a pixel', () => {
    expect(codes(broken((project) => (project.frames[0].placements[0].dx = 1.5)))).toContain('placement-offset');
  });

  it('reject an offset that walks the part off the canvas', () => {
    const faults = validateStructure(broken((project) => (project.frames[0].placements[0].dx = 11)));
    expect(faults.map((fault) => fault.code)).toContain('placement-off-canvas');
    expect(faults.find((fault) => fault.code === 'placement-off-canvas')?.message).toMatch(/only \d+% of it lands/);
  });

  it('accept an offset that keeps most of the part on the canvas', () => {
    expect(codes(broken((project) => (project.frames[0].placements[0].dx = 1)))).toEqual([]);
  });
});

describe('cells', () => {
  it('reject a patch outside the canvas', () => {
    expect(codes(broken((project) => project.frames[0].patch.push({ x: 40, y: 2, index: 1 })))).toContain('cell-bounds');
  });

  it('reject a lock holding an index the palette does not have', () => {
    expect(codes(broken((project) => project.frames[0].locks.push({ x: 4, y: 7, index: 9 })))).toContain('index-outside-palette');
  });

  it('reject a cell that is not at whole-number coordinates', () => {
    // In bounds and so invisible to a bounds check, but resolution writes to
    // `grid[7.5]`, which does not exist.
    expect(codes(broken((project) => project.frames[0].patch.push({ x: 4, y: 7.5, index: 1 })))).toContain('cell-coordinate');
    expect(codes(broken((project) => project.frames[0].locks.push({ x: Number.NaN, y: 7, index: 1 })))).toContain('cell-coordinate');
  });

  it('reject two locks on the same cell, because only one of them can be what the user drew', () => {
    expect(
      codes(broken((project) => project.frames[0].locks.push({ x: 4, y: 7, index: 2 }, { x: 4, y: 7, index: 5 }))),
    ).toContain('duplicate-lock');
  });
});

describe('clips', () => {
  it('reject a frame the project does not have', () => {
    expect(codes(broken((project) => (project.clips[0].frames[1].frameId = 'walk-9')))).toContain('unknown-frame');
  });

  it('reject a duration outside the bounds', () => {
    expect(codes(broken((project) => (project.clips[0].frames[1].durationMs = 0)))).toContain('frame-duration');
  });

  it('reject a fractional duration', () => {
    expect(codes(broken((project) => (project.clips[0].frames[1].durationMs = 120.5)))).toContain('frame-duration');
  });

  it('reject more frames than the cap allows', () => {
    expect(
      codes(broken((project) => (project.clips[0].frames = Array.from({ length: 65 }, () => ({ frameId: 'walk-0', durationMs: 100 }))))),
    ).toContain('clip-length');
  });

  it('reject a clip with no frames at all', () => {
    expect(codes(broken((project) => (project.clips[0].frames = [])))).toContain('clip-empty');
  });
});
