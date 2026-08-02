/** The knight is an example, but it must still meet the character contract. */
import { describe, expect, it } from 'vitest';
import { auditClip, bakeAllClips } from '../src/index';
import { buildCharacter } from '../example/knight';

const spec = buildCharacter();
const baked = bakeAllClips(spec);

describe('Vanguard under the audit gates', () => {
  it.each([...baked.keys()].map((name) => [name] as const))('%s is clean', (name) => {
    const report = auditClip(spec, baked.get(name)!);
    const failures = report.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.text}`);
    expect(failures, failures.join('; ')).toEqual([]);
  });

  it('mirrors the guarded walk exactly', () => {
    const east = baked.get('walk')!.frames;
    const west = baked.get('walk_west')!.frames;
    expect(west.length).toBe(east.length);
    for (let frame = 0; frame < east.length; frame++) {
      expect(west[frame].toRGBA8()).toEqual(east[frame].flippedX().toRGBA8());
    }
  });
});
