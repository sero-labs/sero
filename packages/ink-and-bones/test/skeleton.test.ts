import { describe, expect, it } from 'vitest';
import type { Pose, Vec } from '../src/index';
import { Skeleton, apply, dist } from '../src/index';

function twoBones(): Skeleton {
  const s = new Skeleton();
  s.rootPos = [100, 100];
  s.bone('a', '', [0, 0], 0, 50);
  s.bone('b', 'a', s.tip(), 0, 50);
  return s;
}

describe('fk', () => {
  it('straight chain hangs to root + total length', () => {
    const s = twoBones();
    const tip = apply(s.transforms({ deg: {} }).get('b')!, [0, 50]);
    expect(dist(tip, [100, 200])).toBeLessThan(0.01);
  });

  it('+90deg at the hip swings the tip EAST', () => {
    const s = twoBones();
    const tip = apply(s.transforms({ deg: { a: 90 } }).get('b')!, [0, 50]);
    expect(dist(tip, [200, 100])).toBeLessThan(0.01);
  });

  it('worldDeg accumulates the parent chain', () => {
    const s = twoBones();
    expect(s.worldDeg('b', { deg: { a: 30, b: 10 } })).toBeCloseTo(40, 3);
  });

  it('an unknown parent is an authoring error, loudly', () => {
    const s = new Skeleton();
    expect(() => s.bone('x', 'nope', [0, 0], 0, 10)).toThrow(/unknown parent/);
  });
});

function leg(): Skeleton {
  const s = new Skeleton();
  s.rootPos = [100, 100];
  s.bone('thigh', '', [0, 0], 0, 50);
  s.bone('shin', 'thigh', s.tip(), 0, 50);
  s.bone('foot', 'shin', s.tip(), 90, 10);
  return s;
}

describe('ik', () => {
  const targets: Vec[] = [
    [120, 180],
    [80, 170],
    [100, 195],
    [140, 150],
  ];

  it.each(targets.map((t) => [t] as const))('ankle reaches %j', (target) => {
    const s = leg();
    const pose: Pose = { deg: {} };
    s.solveChain(pose, 'thigh', 'shin', target, 1, 'foot', 90);
    const xfs = s.transforms(pose);
    const ankle = apply(xfs.get('shin')!, [0, 50]);
    expect(dist(ankle, target)).toBeLessThan(0.6);

    // the knee bends EAST of the hip-target line (bend = +1)
    const knee = xfs.get('shin')!;
    const mid: Vec = [(100 + target[0]) / 2, (100 + target[1]) / 2];
    expect(knee.tx).toBeGreaterThanOrEqual(mid[0] - 0.6);

    // the foot bone lands aimed at world 90deg — toe pointing east
    const footTip = apply(xfs.get('foot')!, [0, 10]);
    expect(Math.abs(footTip[0] - ankle[0] - 10)).toBeLessThan(0.1);
    expect(Math.abs(footTip[1] - ankle[1])).toBeLessThan(0.1);
  });

  it('an unreachable target clamps to near-full extension', () => {
    const s = leg();
    const pose: Pose = { deg: {} };
    s.solveChain(pose, 'thigh', 'shin', [100, 400], 1);
    const reach = apply(s.transforms(pose).get('shin')!, [0, 50]);
    expect(dist(reach, [100, 199.5])).toBeLessThan(1);
  });
});
