/** The character-level gate, on the real reference puppet: bake every Scout
 * clip and hold it to all eight audit checks — plus proof the gates fire on
 * a deliberately broken declaration. */
import { describe, expect, it } from 'vitest';
import { auditClip, bakeAllClips, bakeClip, vocabulary } from '../src/index';
import { buildCharacter } from '../example/scout';

const spec = buildCharacter();
const baked = bakeAllClips(spec);

describe('scout under the audit gates', () => {
  it.each([...baked.keys()].map((n) => [n] as const))('%s is clean', (name) => {
    const report = auditClip(spec, baked.get(name)!);
    const fails = report.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.text}`);
    expect(fails, fails.join('; ')).toEqual([]);
  });

  it('west frames are exact flips of east', () => {
    const east = baked.get('run')!.frames;
    const west = baked.get('run_west')!.frames;
    expect(west.length).toBe(east.length);
    for (let f = 0; f < east.length; f++) {
      expect(west[f].toRGBA8()).toEqual(east[f].flippedX().toRGBA8());
    }
  });

  it('the vocabulary is derived from the ramps', () => {
    const vocab = vocabulary(spec);
    expect(vocab.has('151221')).toBe(true); // ink
    expect(vocab.has('f29a3a')).toBe(true); // scarf mid (dusk)
    expect(vocab.has('ffffff')).toBe(false);
  });
});

describe('the gates fire on broken input', () => {
  it('baseline fails when the declared ground row is wrong', () => {
    const broken = { ...spec, groundRow: spec.groundRow - 10 };
    const report = auditClip(broken, baked.get('idle')!);
    const baseline = report.checks.find((c) => c.id === 'baseline')!;
    expect(baseline.ok).toBe(false);
  });

  it('in-place fails when the budget is tightened to nothing', () => {
    const clip = spec.clips.get('run')!;
    const saved = clip.wobbleBudget;
    clip.wobbleBudget = 0.01;
    const report = auditClip(spec, baked.get('run')!);
    clip.wobbleBudget = saved;
    const inPlace = report.checks.find((c) => c.id === 'in-place')!;
    expect(inPlace.ok).toBe(false);
  });

  it('an unknown clip name throws instead of passing silently', () => {
    expect(() => bakeClip(spec, 'moonwalk')).toThrow(/no clip/);
  });
});
