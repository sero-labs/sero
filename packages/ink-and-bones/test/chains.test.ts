import { describe, expect, it } from 'vitest';
import type { Vec } from '../src/index';
import { Motion, Skeleton, dist, simulateChains } from '../src/index';

/** The selftest rig: a hanging 5-link chain on a bone pointing up, driven by
 * a swaying root and a westward wind. */
function simChain(): Vec[][] {
  const s = new Skeleton();
  s.rootPos = [100, 40];
  s.bone('spine', '', [0, 0], 180, 0);
  s.chain('c', 'spine', [0, -10], 5, 12, [-400, 0], 500, 0.92);
  const clip = new Motion('sway', 0.5);
  clip.bakeFps = 10;
  clip.key('root_x', { 0: -4, 0.25: 4 }, 'sine');
  return simulateChains(s, clip, 5).get('c')!;
}

describe('verlet', () => {
  it('two runs are bit-identical (determinism)', () => {
    const a = simChain();
    const b = simChain();
    expect(a.length).toBe(b.length);
    for (let f = 0; f < a.length; f++) {
      for (let i = 0; i < a[f].length; i++) {
        expect(a[f][i][0]).toBe(b[f][i][0]);
        expect(a[f][i][1]).toBe(b[f][i][1]);
      }
    }
  });

  it('link 0 stays pinned to its (moving) anchor', () => {
    for (const pts of simChain()) {
      expect(dist(pts[0], [100, 50])).toBeLessThanOrEqual(6);
    }
  });

  it('link lengths hold within 10%', () => {
    for (const pts of simChain()) {
      for (let i = 0; i < pts.length - 1; i++) {
        expect(Math.abs(dist(pts[i], pts[i + 1]) - 12)).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it('wind actually deflects the chain', () => {
    const frames = simChain();
    const moved = frames.some((pts) => Math.abs(pts[pts.length - 1][0] - 100) > 8);
    expect(moved).toBe(true);
  });
});
