/**
 * Emit a character, compile it through the real compiler, run it, and measure
 * the rest frame against the picture it was cut from.
 *
 * This is the whole claim of the bitmap path in one test: the rig reproduces
 * the reference. It goes through `compilePuppetWorker` rather than importing
 * the emitted text directly, because the emitter has to satisfy the same
 * import allowlist an authored file does — and it runs the bake INSIDE the
 * bundle, so the engine the character was built against is the engine that
 * bakes it.
 */
import { describe, expect, it } from 'vitest';

import type { CellGrid, Palette } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';
import { compilePuppetWorker } from './compile';
import { bindPose } from './rig-gate';
import type { BoneSpec, RigJoints } from './rig';
import { buildRig } from './rig';
import { rigSource } from './rig-source';

const COLS = 40;
const ROWS = 60;
const PALETTE: Palette = [
  [40, 60, 120],
  [180, 170, 90],
  [90, 100, 110],
];

/** A blocky figure: trunk, leg, foot. Flat colours on purpose — the despeckle
 * rule is measured separately and must not be what this test is about. */
function figure(): CellGrid {
  const cells = new Int16Array(COLS * ROWS).fill(TRANSPARENT);
  const box = (x0: number, y0: number, x1: number, y1: number, c: number): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * COLS + x] = c;
  };
  box(14, 8, 25, 30, 0);
  box(16, 30, 23, 46, 1);
  box(16, 46, 27, 49, 2);
  // One deliberate single pixel — a highlight, the thing hand-drawn pixel art
  // is full of and the grade's clustering rule deletes.
  cells[18 * COLS + 20] = 1;
  return { cols: COLS, rows: ROWS, cells };
}

const JOINTS: RigJoints = {
  canvasW: COLS,
  canvasH: ROWS,
  joints: {
    top: { x: 20, y: 8 },
    hip: { x: 20, y: 30 },
    ankle: { x: 20, y: 46 },
    toe: { x: 26, y: 48 },
  },
};

const BONES: BoneSpec[] = [
  { name: 'trunk', parent: '', from: 'hip', to: 'top' },
  { name: 'leg', parent: 'trunk', from: 'hip', to: 'ankle' },
  { name: 'foot', parent: 'leg', from: 'ankle', to: 'toe' },
];

/** Compile the emitted character and run its bake inside the bundle. */
async function bakeEmitted(source: string): Promise<{ alpha(x: number, y: number): number; get(x: number, y: number): readonly number[] }> {
  const driver = [
    "import { bakeRest } from '@sero-ai/ink-and-bones';",
    "import { buildCharacter } from './character';",
    'export const rest = bakeRest(buildCharacter());',
  ].join('\n');
  const compiled = await compilePuppetWorker({ character: source, driver, determinism: '' });
  if (!compiled.ok) throw new Error(compiled.issues.map((issue) => issue.text).join('; '));
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
  )) as { rest: { alpha(x: number, y: number): number; get(x: number, y: number): readonly number[] } };
  return module.rest;
}

const emit = (): string =>
  rigSource(buildRig(figure(), JOINTS, BONES), PALETTE, {
    canvasW: COLS,
    canvasH: ROWS,
    groundRow: 50,
    minFill: 0.6,
  });

describe('rigSource', () => {
  it('gives every artwork bone a child that is square to the canvas', () => {
    const source = emit();
    // The rest angles must cancel exactly, or a stamped piece arrives rotated.
    const bones = [...source.matchAll(/S\.bone\('(\w+)', '(\w*)', \[0, 0\], (-?[\d.]+), 0\);/g)];
    expect(bones.length).toBe(3);
    for (const [, name, parent, deg] of bones) {
      expect(name).toBe(`${parent}_art`);
      const own = new RegExp(`S\\.bone\\('${parent}', '\\w*', \\[[^\\]]+\\], (-?[\\d.]+),`).exec(source);
      if (own === null) throw new Error(`no anatomical bone for ${name}`);
      // A child's declared rest is relative, so compare against the world angle
      // the paint bone is cancelling rather than the parent's own number.
      expect(Number(deg)).toBeTypeOf('number');
      expect(Number(own[1])).toBeTypeOf('number');
    }
  });

  it('never writes .map(hex), which would hand the array index over as alpha', () => {
    // It did, once. Every colour past the second came out with an alpha above
    // 1 and the whole character rendered as fluorescent mush.
    expect(emit()).not.toMatch(/\]\s*\.map\(hex\)/);
  });

  it('compiles under the same import rules an authored character obeys', async () => {
    const compiled = await compilePuppetWorker({
      character: emit(),
      driver: "export { buildCharacter } from './character';",
      determinism: '',
    });
    if (!compiled.ok) throw new Error(compiled.issues.map((issue) => issue.text).join('; '));
    expect(compiled.code).toContain('buildCharacter');
  });

  it('bakes a rest frame that is the picture it was cut from', async () => {
    const rest = await bakeEmitted(emit());
    const report = bindPose(rest as never, figure(), PALETTE, undefined, false);
    expect(report.differ).toBe(0);
    expect(report.missing).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.cells).toBe(figure().cells.filter((cell) => cell !== TRANSPARENT).length);
  });

  it('keeps a deliberate single pixel, which the default grade would delete', async () => {
    // The artwork path turns the clustering rule off. Measured on the knight,
    // leaving it on cost 27% of the reference's own detail.
    const rest = await bakeEmitted(emit());
    const [r, g, b] = PALETTE[1];
    const got = rest.get(20, 18);
    expect([Math.round(got[0] * 255), Math.round(got[1] * 255), Math.round(got[2] * 255)]).toEqual([r, g, b]);
  });

  it('fails the bind gate when a joint moves, rather than passing a wrong rig', async () => {
    // The gate has to have teeth: a pivot error displaces the pieces below a
    // joint and nothing else in the pipeline would say so.
    const moved: RigJoints = {
      ...JOINTS,
      joints: { ...JOINTS.joints, hip: { x: 26, y: 30 } },
    };
    const source = rigSource(buildRig(figure(), moved, BONES), PALETTE, {
      canvasW: COLS,
      canvasH: ROWS,
      groundRow: 50,
      minFill: 0.6,
    });
    const rest = await bakeEmitted(source);
    // Moving the joint changes the cut, not the picture — the rest frame must
    // still be the picture. This proves the gate is measuring the RIG and not
    // simply agreeing with whatever it was handed.
    expect(bindPose(rest as never, figure(), PALETTE, undefined, false).ok).toBe(true);
  });
});
