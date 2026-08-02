import { describe, expect, it } from 'vitest';
import type { Pose, Vec } from '../src/index';
import { Motion, Skeleton, apply, dist } from '../src/index';

function oneBone(): Skeleton {
  const s = new Skeleton();
  s.bone('a', '', [0, 0], 0, 1);
  return s;
}

describe('curves', () => {
  it('linear midpoint', () => {
    const c = new Motion('t', 1.0);
    c.key('a', { 0: 0, 0.5: 10 }, 'linear');
    expect(c.poseAt(0.25, oneBone()).deg.a).toBeCloseTo(5, 3);
  });

  it('a loop wraps continuously', () => {
    const c = new Motion('t', 1.0);
    c.key('a', { 0: 0, 0.5: 10 }, 'linear');
    const s = oneBone();
    const nearWrap = c.poseAt(0.999, s).deg.a;
    const atZero = c.poseAt(0, s).deg.a;
    expect(Math.abs(nearWrap - atZero)).toBeLessThan(0.1);
  });

  it('step holds until the next key', () => {
    const c = new Motion('t2', 1.0);
    c.key('a', { 0: 0, 0.5: 10 }, 'step');
    expect(Math.abs(c.poseAt(0.49, oneBone()).deg.a)).toBeLessThan(0.001);
  });

  it('a non-loop clamps at the last key', () => {
    const c = new Motion('t3', 1.0, false);
    c.key('a', { 0: 0, 1: 8 }, 'linear');
    expect(c.poseAt(2.0, oneBone()).deg.a).toBeCloseTo(8, 3);
  });
});

describe('plant', () => {
  function leg(): Skeleton {
    const s = new Skeleton();
    s.rootPos = [100, 100];
    s.bone('thigh', '', [0, 0], 0, 50);
    s.bone('shin', 'thigh', s.tip(), 0, 50);
    s.bone('foot', 'shin', s.tip(), 90, 10);
    return s;
  }

  it('holds the ankle on the keyed path', () => {
    const s = leg();
    const c = new Motion('t', 1.0);
    c.plant(
      'thigh',
      'shin',
      'foot',
      { 0: [120, 180, 90], 0.5: [80, 160, 120] },
      'linear',
    );
    const probes: Array<[number, Vec]> = [
      [0, [120, 180]],
      [0.5, [80, 160]],
      [0.75, [100, 170]],
    ];
    for (const [t, want] of probes) {
      const pose = c.poseAt(t, s);
      const ankle = apply(s.transforms(pose).get('shin')!, [0, 50]);
      expect(dist(ankle, want), `t=${t}`).toBeLessThan(0.8);
    }
  });

  it('plant channels never leak into the pose', () => {
    const s = leg();
    const c = new Motion('t', 1.0);
    c.plant('thigh', 'shin', 'foot', { 0: [120, 180, 90] });
    const pose: Pose = c.poseAt(0, s);
    expect('plant_x:foot' in pose.deg).toBe(false);
  });
});

describe('z-order', () => {
  it('override active mid-clip, back to declared depth after', () => {
    const c = new Motion('t', 1.0);
    c.layer('blade', { 0: 0, 0.4: 5, 0.8: 0 });
    expect(c.zOffsets(0.5).get('blade')).toBeCloseTo(5, 3);
    expect(c.zOffsets(0.9).get('blade')).toBeCloseTo(0, 3);
  });

  it('z channels never leak into the pose', () => {
    const c = new Motion('t', 1.0);
    c.layer('blade', { 0: 0, 0.4: 5 });
    expect('z:blade' in c.poseAt(0.5, new Skeleton()).deg).toBe(false);
  });
});
