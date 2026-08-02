/**
 * The rig builder. Two things here are worth a test each, because both failed
 * silently in practice and neither shows up in a picture until much later:
 * the pivot maths (a sign error displaced every piece below a joint) and who
 * owns which cell (a sword tip's outline was given to the far FOOT, thirty
 * cells away, and flew across the canvas on every step).
 */
import { describe, expect, it } from 'vitest';

import type { CellGrid } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';
import type { BoneSpec, RigJoints } from './rig';
import { SS, buildBones, buildRig, cutPieces } from './rig';

/** A canvas with an opaque rectangle drawn in palette index `c`. */
function grid(cols: number, rows: number, boxes: { x0: number; y0: number; x1: number; y1: number; c: number }[]): CellGrid {
  const cells = new Int16Array(cols * rows).fill(TRANSPARENT);
  for (const box of boxes) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) cells[y * cols + x] = box.c;
    }
  }
  return { cols, rows, cells };
}

const joints = (points: Record<string, [number, number]>): RigJoints => ({
  canvasW: 40,
  canvasH: 60,
  joints: Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => [name, { x, y }])),
});

describe('buildBones', () => {
  it('measures a bone that points straight down as zero degrees', () => {
    // The engine's convention: 0 is screen-DOWN and positive swings east.
    const built = buildBones(joints({ a: [10, 10], b: [10, 30] }), [
      { name: 'down', parent: '', from: 'a', to: 'b' },
    ]);
    expect(built.bones[0].worldDeg).toBeCloseTo(0, 6);
    expect(built.bones[0].length).toBeCloseTo(20 * SS, 6);
  });

  it('measures a bone that points east as ninety degrees', () => {
    const built = buildBones(joints({ a: [10, 10], b: [30, 10] }), [
      { name: 'east', parent: '', from: 'a', to: 'b' },
    ]);
    expect(built.bones[0].worldDeg).toBeCloseTo(90, 6);
  });

  it('puts a bone that continues its parent exactly at the parent tip', () => {
    // The one check that catches a sign error in the pivot maths: whatever the
    // parent's angle, a child starting where the parent ends has to sit at
    // [0, parentLength] in the parent's own frame. It read [-27, -22] while the
    // rotation was being undone the wrong way round.
    const specs: BoneSpec[] = [
      { name: 'upper', parent: '', from: 'shoulder', to: 'elbow' },
      { name: 'lower', parent: 'upper', from: 'elbow', to: 'wrist' },
    ];
    const built = buildBones(
      joints({ shoulder: [20, 10], elbow: [11, 24], wrist: [17, 35] }),
      specs,
    );
    expect(built.bones[1].pivot[0]).toBeCloseTo(0, 6);
    expect(built.bones[1].pivot[1]).toBeCloseTo(built.bones[0].length, 6);
  });

  it('reports a bone whose joints are not placed rather than inventing one', () => {
    const built = buildBones(joints({ a: [10, 10], b: [10, 30] }), [
      { name: 'down', parent: '', from: 'a', to: 'b' },
      { name: 'ghost', parent: 'down', from: 'b', to: 'nowhere' },
    ]);
    expect(built.bones).toHaveLength(1);
    expect(built.missing.join(' ')).toContain('ghost');
  });

  it('skips a bone whose parent was skipped instead of reparenting it', () => {
    const built = buildBones(joints({ a: [10, 10], b: [10, 30] }), [
      { name: 'down', parent: '', from: 'a', to: 'b' },
      { name: 'ghost', parent: 'down', from: 'b', to: 'nowhere' },
      { name: 'orphan', parent: 'ghost', from: 'a', to: 'b' },
    ]);
    expect(built.bones.map((bone) => bone.name)).toEqual(['down']);
    expect(built.missing.join(' ')).toContain("its parent 'ghost' was skipped");
  });
});

describe('cutPieces', () => {
  const twoLimbs: BoneSpec[] = [
    { name: 'trunk', parent: '', from: 'top', to: 'hip' },
    { name: 'leg', parent: 'trunk', from: 'hip', to: 'foot' },
  ];
  const stick = joints({ top: [10, 4], hip: [10, 20], foot: [10, 40] });

  it('gives every cell to the bone it is nearest', () => {
    const cut = cutPieces(grid(40, 60, [{ x0: 8, y0: 4, x1: 12, y1: 40, c: 0 }]), buildBones(stick, twoLimbs).bones, {
      jointRadius: 0,
    });
    const trunk = cut.pieces.find((piece) => piece.name === 'trunk');
    const leg = cut.pieces.find((piece) => piece.name === 'leg');
    if (trunk === undefined || leg === undefined) throw new Error('a limb got nothing');
    expect(trunk.own + leg.own).toBe(5 * 37);
    // The split lands at the hip, not somewhere else on the stick.
    expect(trunk.y0).toBe(4);
    expect(leg.y0 + leg.h - 1).toBe(40);
  });

  it('lets the parent reach under its child around the joint, and only there', () => {
    const bones = buildBones(stick, twoLimbs).bones;
    const cells = grid(40, 60, [{ x0: 8, y0: 4, x1: 12, y1: 40, c: 0 }]);
    const tight = cutPieces(cells, bones, { jointRadius: 0 });
    const loose = cutPieces(cells, bones, { jointRadius: 4 });
    const under = loose.pieces.find((piece) => piece.name === 'trunk')!.shared;
    expect(tight.pieces.find((piece) => piece.name === 'trunk')!.shared).toBe(0);
    expect(under).toBeGreaterThan(0);
    // One way only: the child never gets a copy of the parent's cells, or the
    // copy would ride on top of the limb instead of hiding beneath it.
    expect(loose.pieces.find((piece) => piece.name === 'leg')!.shared).toBe(0);
    // And near the joint only — not the whole boundary.
    expect(under).toBeLessThan(loose.pieces.find((piece) => piece.name === 'leg')!.own);
  });

  it('gives a prop what falls inside its own outline, whatever is nearer', () => {
    // A blade crossing the body: on distance alone the trunk wins those cells
    // and the skirt flies off with the swing.
    const specs: BoneSpec[] = [
      ...twoLimbs,
      { name: 'blade', parent: 'leg', from: 'hip', to: 'tip', capsule: { r0: 2, r1: 2 } },
    ];
    const withTip = joints({ top: [10, 4], hip: [10, 20], foot: [10, 40], tip: [30, 20] });
    const cut = cutPieces(
      grid(40, 60, [
        { x0: 8, y0: 4, x1: 12, y1: 40, c: 0 },
        { x0: 12, y0: 19, x1: 30, y1: 21, c: 1 },
      ]),
      buildBones(withTip, specs).bones,
      { jointRadius: 0 },
    );
    const blade = cut.pieces.find((piece) => piece.name === 'blade');
    if (blade === undefined) throw new Error('the prop got nothing');
    expect(blade.own).toBeGreaterThan(40);
    expect(blade.shared).toBe(0);
  });

  it('grows a prop over what only it is near, so its outline stops flying away', () => {
    // The real failure: cells just outside the capsule — a blade's dark edge —
    // went to the nearest body bone, which for a sword held out to the side was
    // the far foot.
    const specs: BoneSpec[] = [
      ...twoLimbs,
      { name: 'blade', parent: 'leg', from: 'hip', to: 'tip', capsule: { r0: 1, r1: 1 } },
    ];
    const withTip = joints({ top: [10, 4], hip: [10, 20], foot: [10, 40], tip: [34, 20] });
    const cells = grid(40, 60, [
      { x0: 8, y0: 4, x1: 12, y1: 40, c: 0 },
      { x0: 12, y0: 18, x1: 34, y1: 22, c: 1 },
    ]);
    const bones = buildBones(withTip, specs).bones;
    const cut = cutPieces(cells, bones, { jointRadius: 0 });
    const blade = cut.pieces.find((piece) => piece.name === 'blade')!;
    // The blade's far end is 20+ cells from any body bone, so all of it is the
    // blade's — none of it hangs off the leg.
    const legIndex = bones.findIndex((bone) => bone.name === 'leg');
    for (let y = 18; y <= 22; y++) expect(cut.owner[y * 40 + 32]).not.toBe(legIndex);
    expect(blade.x0 + blade.w - 1).toBe(34);
  });

  it('leaves nothing unclaimed', () => {
    const rig = buildRig(grid(40, 60, [{ x0: 8, y0: 4, x1: 12, y1: 40, c: 0 }]), stick, twoLimbs);
    expect(rig.orphans).toBe(0);
    expect(rig.missing).toEqual([]);
  });
});
