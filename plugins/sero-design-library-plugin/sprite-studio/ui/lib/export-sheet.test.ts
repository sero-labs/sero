import { describe, expect, it } from 'vitest';

import type { SpriteExportOptions } from '../../shared/state';
import { buildSheet, resolveScale, tagName, type SheetAnimation } from './export-sheet';

/**
 * The sheet the export screen states before anything is written.
 *
 * The scale rule is the one worth guarding: a fractional scale blurs the
 * artwork the whole pipeline exists to recover, so a request that does not
 * divide cleanly is resolved and the real size is reported (D3, spec §7).
 */

const CHARACTER = { id: 'explorer', artHeight: 136, palette: ['#3f6b34', '#2c4d26'] };

const OPTIONS: SpriteExportOptions = {
  scale: 1,
  layout: 'rows',
  uniformCell: false,
  trim: false,
  destination: { kind: 'downloads' },
};

function animation(overrides: Partial<SheetAnimation> = {}): SheetAnimation {
  return {
    id: 'a',
    name: 'Whip attack · overhead',
    loop: 'once',
    canvas: { cols: 173, rows: 156 },
    anchor: { col: 86, row: 148 },
    durationsMs: [66, 66],
    ...overrides,
  };
}

describe('resolving a wanted size to a whole scale', () => {
  it('takes the nearest whole multiple and reports what that really gives', () => {
    // The spec's own example: 512 px asked for, from a 136 px character.
    const resolved = resolveScale(62, 136, 512);
    expect(resolved.scale).toBe(4);
    expect(resolved.height).toBe(544);
    expect(resolved.width).toBe(248);
    expect(resolved.adjusted).toBe(true);
  });

  it('says nothing was adjusted when the request already divides cleanly', () => {
    expect(resolveScale(62, 136, 1088)).toMatchObject({ scale: 8, adjusted: false });
  });

  it('never resolves below 1×, whatever was asked for', () => {
    expect(resolveScale(62, 136, 10).scale).toBe(1);
    expect(resolveScale(62, 136, 0).scale).toBe(1);
  });
});

describe('atlas tag names', () => {
  it('reduce a display name to one word an engine can index by', () => {
    expect(tagName('Whip attack · overhead')).toBe('whip_attack_overhead');
    expect(tagName('Resting')).toBe('resting');
    expect(tagName('···')).toBe('animation');
  });
});

describe('the sheet', () => {
  it('gives every animation its own row, at the scale asked for', () => {
    const sheet = buildSheet(
      CHARACTER,
      [animation(), animation({ id: 'b', name: 'Resting', canvas: { cols: 65, rows: 139 } })],
      { ...OPTIONS, scale: 2 },
    );
    expect(sheet.atlas.frames[0]?.frame).toEqual({ x: 0, y: 0, w: 346, h: 312 });
    expect(sheet.atlas.frames[1]?.frame).toEqual({ x: 346, y: 0, w: 346, h: 312 });
    // The second animation starts below the first, at its own cell size.
    expect(sheet.atlas.frames[2]?.frame).toEqual({ x: 0, y: 312, w: 130, h: 278 });
    expect(sheet.atlas.meta.size).toEqual({ w: 692, h: 590 });
  });

  it('lays every frame in one row when asked to', () => {
    const sheet = buildSheet(CHARACTER, [animation(), animation({ id: 'b' })], {
      ...OPTIONS,
      layout: 'single-row',
    });
    expect(sheet.atlas.frames.map((frame) => frame.frame.x)).toEqual([0, 173, 346, 519]);
    expect(sheet.atlas.meta.size).toEqual({ w: 692, h: 156 });
  });

  it('pads every animation up to the largest cell when a uniform grid is wanted', () => {
    const sheet = buildSheet(
      CHARACTER,
      [animation({ canvas: { cols: 65, rows: 139 } }), animation({ id: 'b' })],
      { ...OPTIONS, uniformCell: true },
    );
    expect(sheet.atlas.frames.every((frame) => frame.frame.w === 173)).toBe(true);
    expect(sheet.cell).toEqual({ width: 173, height: 156 });
  });

  it('carries the real timing, the direction and the anchor into the atlas', () => {
    const sheet = buildSheet(
      CHARACTER,
      [animation({ loop: 'pingpong', durationsMs: [66, 133] })],
      OPTIONS,
    );
    expect(sheet.atlas.frames.map((frame) => frame.duration)).toEqual([66, 133]);
    expect(sheet.atlas.meta.frameTags).toEqual([
      { name: 'whip_attack_overhead', from: 0, to: 1, direction: 'pingpong' },
    ]);
    expect(sheet.atlas.meta.sero).toMatchObject({
      character: 'explorer',
      artHeight: 136,
      anchor: { x: 86, y: 148 },
      palette: ['#3f6b34', '#2c4d26'],
    });
  });

  it('has nothing to lay out when nothing is included', () => {
    const sheet = buildSheet(CHARACTER, [], OPTIONS);
    expect(sheet.frameCount).toBe(0);
    expect(sheet.atlas.meta.size).toEqual({ w: 0, h: 0 });
    expect(sheet.atlas.meta.frameTags).toEqual([]);
  });

  it('leaves out an animation with no frames rather than tagging an empty range', () => {
    const sheet = buildSheet(CHARACTER, [animation({ durationsMs: [] })], OPTIONS);
    expect(sheet.atlas.meta.frameTags).toEqual([]);
  });
});
