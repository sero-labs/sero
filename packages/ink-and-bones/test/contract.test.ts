/**
 * Contract enforcement on malformed authored input. Characters arrive from
 * generated code, so every "plausible garbage" shape must fail loudly —
 * a bake that hangs, or an audit that passes vacuously, poisons the whole
 * authoring loop. Each test here proves one rejection actually fires.
 */
import { describe, expect, it } from 'vitest';
import type { BakedClip } from '../src/index';
import { ClipPlayer, Img, Motion, Skeleton, auditClip, bake, bakeClip, hex, simulateChains } from '../src/index';
import { buildCharacter } from '../example/scout';

const spec = buildCharacter();

describe('malformed timing', () => {
  it.each([
    [0],
    [-1],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [61],
  ])('bakeFps %d is rejected at bake time', (fps) => {
    const clip = spec.clips.get('run')!;
    const saved = clip.bakeFps;
    clip.bakeFps = fps;
    try {
      expect(() => bakeClip(spec, 'run')).toThrow(/bakeFps/);
    } finally {
      clip.bakeFps = saved;
    }
  });

  it('the low-level entry points enforce the same law — no bypass', () => {
    const clip = spec.clips.get('run')!;
    const saved = clip.bakeFps;
    clip.bakeFps = 120;
    try {
      expect(() =>
        bake(spec.skeleton, spec.parts, clip, spec.canvasW, spec.canvasH, spec.grade),
      ).toThrow(/bakeFps/);
      expect(() => simulateChains(spec.skeleton, clip, 9)).toThrow(/bakeFps/);
    } finally {
      clip.bakeFps = saved;
    }
    const badCycle = new Motion('t', Number.NaN);
    expect(() => simulateChains(new Skeleton(), badCycle, 1)).toThrow(/cycle/);
  });

  it('a bad fps cannot hang the player', () => {
    const broken: BakedClip = { name: 't', frames: [new Img(1, 1), new Img(1, 1)], fps: -1, loop: true };
    const p = new ClipPlayer(broken);
    expect(p.advance(1)).toBe(0); // returns, does not spin
    expect(p.advance(Number.NaN)).toBe(0);
  });

  it('an infinite dt cannot poison the frame counter', () => {
    const p = new ClipPlayer({ name: 't', frames: [new Img(1, 1), new Img(1, 1)], fps: 10, loop: true });
    expect(p.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(p.advance(0.1)).toBe(1); // still advances normally afterwards
  });
});

describe('malformed colours', () => {
  it('hex() rejects anything but 6 hex digits', () => {
    expect(() => hex('nothex')).toThrow(/hex/);
    expect(() => hex('fff')).toThrow(/hex/);
    expect(() => hex('4e5f788')).toThrow(/hex/);
    expect(hex('4e5f78')[3]).toBe(1);
  });
});

describe('vacuous audits', () => {
  it('an empty clip fails valid, not passes everything', () => {
    const empty: BakedClip = { name: 'idle', frames: [], fps: 12, loop: true };
    const report = auditClip(spec, empty);
    expect(report.failed).toBe(1);
    expect(report.checks[0].id).toBe('valid');
  });

  it('frames off the declared canvas fail valid', () => {
    const wrong: BakedClip = { name: 'idle', frames: [new Img(10, 10)], fps: 12, loop: true };
    const report = auditClip(spec, wrong);
    expect(report.failed).toBe(1);
    expect(report.checks[0].id).toBe('valid');
    expect(report.checks[0].text).toContain('64x80');
  });

  it('a clip declared airborne that never flies fails baseline', () => {
    const idle = spec.clips.get('idle')!;
    idle.airborne = true;
    try {
      const report = auditClip(spec, bakeClip(spec, 'idle'));
      const baseline = report.checks.find((c) => c.id === 'baseline')!;
      expect(baseline.ok).toBe(false);
      expect(baseline.text).toContain('ever leaves the ground');
    } finally {
      idle.airborne = false;
    }
  });
});
