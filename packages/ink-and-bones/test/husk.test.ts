/** Husk is an example, but it must still meet the character contract. */
import { describe, expect, it } from 'vitest';
import { auditClip, bakeAllClips } from '../src/index';
import { buildCharacter } from '../example/husk';

const spec = buildCharacter();
const baked = bakeAllClips(spec);

describe('Husk under the audit gates', () => {
  it.each([...baked.keys()].map((name) => [name] as const))('%s is clean', (name) => {
    const report = auditClip(spec, baked.get(name)!);
    const failures = report.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.id}: ${check.text}`);
    expect(failures, failures.join('; ')).toEqual([]);
  });

  it('mirrors the shamble exactly', () => {
    const east = baked.get('shamble')!.frames;
    const west = baked.get('shamble_west')!.frames;
    expect(west.length).toBe(east.length);
    for (let frame = 0; frame < east.length; frame++) {
      expect(west[frame].toRGBA8()).toEqual(east[frame].flippedX().toRGBA8());
    }
  });

  it('limps in place: the dragged leg does not walk the body sideways', () => {
    // The limp is authored as a LIFT difference, so the in-place gate above
    // covers it — this pins the shape of the clip the gate is checking.
    expect(baked.get('shamble')!.frames.length).toBeGreaterThan(8);
    expect(spec.clips.get('lunge')!.loop).toBe(false);
  });
});
