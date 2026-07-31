import { describe, expect, it } from 'vitest';

import { encodeGrid, type Grid } from './grid';
import { clearLocks, lockCell, NO_OWNER, resolveFrame, resolveFrameTraced } from './resolve';
import { findFrame, type Frame, type PixelProject } from './schema';
import { KNIGHT_BASE_POSE, knightProject } from './testing/fixtures';

function frameOf(project: PixelProject, id: string): Frame {
  const frame = findFrame(project, id);
  if (frame === undefined) throw new Error(`fixture has no frame "${id}"`);
  return frame;
}

function rowsOf(grid: Grid): string[] {
  return encodeGrid(grid);
}

describe('placements', () => {
  it('put the parts back where they were cut from', () => {
    const project = knightProject();
    expect(rowsOf(resolveFrame(project, frameOf(project, 'base')))).toEqual([...KNIGHT_BASE_POSE]);
  });

  it('are drawn in array order, so the upper part covers the joint', () => {
    const project = knightProject();
    const frame = frameOf(project, 'base');
    const { owner } = resolveFrameTraced(project, frame);
    const headIndex = frame.placements.findIndex((placement) => placement.partId === 'head');
    const bodyIndex = frame.placements.findIndex((placement) => placement.partId === 'body');
    // Row 5 belongs to both cuts. The head is placed last, so it owns the seam.
    expect(owner[5][4]).toBe(headIndex);
    expect(owner[7][4]).toBe(bodyIndex);
  });

  it('do not erase what is under them, so a bob cannot open a seam at a joint', () => {
    const project = knightProject();
    const bobbed = resolveFrame(project, frameOf(project, 'walk-1'));
    // The body and head rise a pixel while the legs stay put. Every column of the
    // torso stays solid across the hips; a butt-jointed rig opens a row here.
    for (let x = 3; x <= 8; x += 1) expect(bobbed[9][x]).not.toBe(0);
  });

  it('mirror about the part when a placement asks for a flip', () => {
    const project = knightProject();
    // The whip is the only asymmetric part: at row 8 it holds leather then nothing.
    const upright: Frame = { id: 'upright', placements: [{ partId: 'whip', dx: 0, dy: 0 }], patch: [], locks: [] };
    const flipped: Frame = { id: 'flipped', placements: [{ partId: 'whip', dx: 0, dy: 0, flipX: true }], patch: [], locks: [] };
    expect(resolveFrame(project, upright)[8].slice(10)).toEqual([5, 0]);
    expect(resolveFrame(project, flipped)[8].slice(10)).toEqual([0, 5]);
  });

  it('clip at the canvas edge instead of throwing', () => {
    const project = knightProject();
    const frame: Frame = { id: 'off', placements: [{ partId: 'head', dx: -20, dy: -20 }], patch: [], locks: [] };
    expect(resolveFrame(project, frame).flat().every((value) => value === 0)).toBe(true);
  });

  it('throw when a placement names something the project does not have', () => {
    const project = knightProject();
    const frame: Frame = { id: 'ghost', placements: [{ partId: 'wing', dx: 0, dy: 0 }], patch: [], locks: [] };
    expect(() => resolveFrame(project, frame)).toThrow(/wing/);
  });
});

describe('the patch', () => {
  it('is applied after the placements', () => {
    const project = knightProject();
    const frame = { ...frameOf(project, 'base'), patch: [{ x: 4, y: 7, index: 5 }] };
    expect(resolveFrame(project, frame)[7][4]).toBe(5);
  });

  it('can erase, because index 0 means transparent', () => {
    const project = knightProject();
    const frame = { ...frameOf(project, 'base'), patch: [{ x: 4, y: 7, index: 0 }] };
    expect(resolveFrame(project, frame)[7][4]).toBe(0);
  });

  it('does not change who owns the cell, so the integrity check can still see it', () => {
    const project = knightProject();
    const frame = { ...frameOf(project, 'base'), patch: [{ x: 4, y: 7, index: 5 }] };
    const { owner } = resolveFrameTraced(project, frame);
    expect(owner[7][4]).not.toBe(NO_OWNER);
  });
});

describe('locks are applied last', () => {
  it('beat a placement', () => {
    const project = knightProject();
    const frame = lockCell(frameOf(project, 'base'), 4, 7, 2);
    expect(resolveFrame(project, frame)[7][4]).toBe(2);
  });

  it('beat a patch that targets the same cell', () => {
    const project = knightProject();
    const frame = lockCell({ ...frameOf(project, 'base'), patch: [{ x: 4, y: 7, index: 5 }] }, 4, 7, 2);
    expect(resolveFrame(project, frame)[7][4]).toBe(2);
  });

  it('survive a frame that is regenerated from different placements', () => {
    const project = knightProject();
    const locked = lockCell(frameOf(project, 'base'), 4, 7, 2);
    const regenerated: Frame = { ...locked, placements: frameOf(project, 'walk-2').placements, patch: [{ x: 4, y: 7, index: 3 }] };
    expect(resolveFrame(project, regenerated)[7][4]).toBe(2);
  });

  it('hold a transparent value, so a user can erase a cell for good', () => {
    const project = knightProject();
    const frame = lockCell(frameOf(project, 'base'), 4, 7, 0);
    expect(resolveFrame(project, frame)[7][4]).toBe(0);
  });

  it('are cleared one at a time or all at once', () => {
    const project = knightProject();
    const frame = lockCell(lockCell(frameOf(project, 'base'), 4, 7, 2), 5, 7, 2);
    expect(clearLocks(frame, [{ x: 4, y: 7 }]).locks).toEqual([{ x: 5, y: 7, index: 2 }]);
    expect(clearLocks(frame).locks).toEqual([]);
  });

  it('replace rather than stack when the same cell is edited twice', () => {
    const project = knightProject();
    const frame = lockCell(lockCell(frameOf(project, 'base'), 4, 7, 2), 4, 7, 5);
    expect(frame.locks).toEqual([{ x: 4, y: 7, index: 5 }]);
  });
});

describe('a frame may carry its own grid', () => {
  it('is the layer everything else draws over', () => {
    const project = knightProject();
    const frame: Frame = { id: 'drawn', rows: KNIGHT_BASE_POSE, placements: [], patch: [], locks: [] };
    expect(rowsOf(resolveFrame(project, frame))).toEqual([...KNIGHT_BASE_POSE]);
  });
});
