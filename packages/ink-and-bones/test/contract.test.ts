/**
 * Contract enforcement on malformed authored input. Characters arrive from
 * generated code, so every "plausible garbage" shape must fail loudly —
 * a bake that hangs, or an audit that passes vacuously, poisons the whole
 * authoring loop. Each test here proves one rejection actually fires.
 */
import { describe, expect, it } from 'vitest';
import type { BakedClip, Color } from '../src/index';
import { ClipPlayer, Img, Motion, Paint, Skeleton, auditClip, bake, bakeClip, bakeRest, hex, limitImgAllocations, simulateChains } from '../src/index';
import { buildCharacter } from '../example/scout';

const spec = buildCharacter();

/** Opaque pixels on a Paint canvas — "did this call draw anything at all". */
function opaque(p: Paint): number {
  let n = 0;
  for (let y = 0; y < p.img.h; y++) for (let x = 0; x < p.img.w; x++) if (p.img.alpha(x, y) >= 0.5) n++;
  return n;
}

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

describe('malformed allocations', () => {
  it('Img refuses a canvas beyond any legitimate use', () => {
    expect(() => new Img(10_000, 10_000)).toThrow(/refusing/);
    expect(new Img(1900, 4000).w).toBe(1900); // the widest review sheets fit
  });

  it('a hoard of sub-limit canvases dies at the cumulative budget', () => {
    limitImgAllocations(10_000_000);
    try {
      expect(() => {
        const hoard: Img[] = [];
        for (let i = 0; i < 1_000; i++) hoard.push(new Img(1000, 1000));
      }).toThrow(/budget/);
    } finally {
      limitImgAllocations(Number.POSITIVE_INFINITY);
    }
  });
});

describe('malformed painters', () => {
  it('ribbon and stroke throw on a non-points argument — never a silent no-op', () => {
    // The exact mistake a generated painter makes: (points) => instead of
    // (paint, points) =>, which hands ribbon the Paint object. Silently
    // drawing nothing passes every audit; an invisible part must throw.
    const p = new Paint({ x: 0, y: 0, w: 10, h: 10 });
    const notPoints = p as unknown as [number, number][];
    expect(() => p.ribbon(notPoints, 3, 2, hex('4e5f78'))).toThrow(/painter\(paint, points\)/);
    expect(() => p.stroke(notPoints, [2], hex('4e5f78'))).toThrow(/painter\(paint, points\)/);
    // Real points still draw.
    p.ribbon([[2, 2], [8, 8]], 2, 2, hex('4e5f78'));
  });

  it('stroke rejects a bare number where the width profile belongs', () => {
    // The knight's visor slit, shield emblem and crossguard were all written
    // this way. Every one drew nothing and every gate stayed green.
    const p = new Paint({ x: 0, y: 0, w: 16, h: 16 });
    const widths = 3 as unknown as number[];
    expect(() => p.stroke([[2, 8], [14, 8]], widths, hex('4e5f78'))).toThrow(/ARRAY of half-widths/);
    expect(() => p.stroke([[2, 8], [14, 8]], [], hex('4e5f78'))).toThrow(/non-empty/);
    p.stroke([[2, 8], [14, 8]], [3, 3], hex('4e5f78'));
    expect(opaque(p)).toBeGreaterThan(0);
  });

  it('occludeAbove rejects a colour where a strength belongs', () => {
    // Passing (vec, depth, colour, n) let NaN through and washed a whole torso
    // to flat white — the reason a knight read as a featureless slab.
    const p = new Paint({ x: -8, y: -2, w: 16, h: 20 });
    p.capsule([0, 0], [0, 16], 6, 6, hex('4e5f78'));
    const amount = hex('313d52') as unknown as number;
    expect(() => p.occludeAbove(6, 8, amount)).toThrow(/amount must be a finite number/);
    expect(() => p.occludeAbove([0, 6] as unknown as number, 8, 0.25)).toThrow(/atY/);
    p.occludeAbove(6, 8, 0.25);
  });

  it('capsule, disc and tintToward reject undefined numbers and colours', () => {
    const p = new Paint({ x: 0, y: 0, w: 16, h: 16 });
    const missing = undefined as unknown as number;
    expect(() => p.capsule([0, 0], [8, 8], missing, 3, hex('4e5f78'))).toThrow(/r0/);
    expect(() => p.capsule([0, 0], [8, 8], 3, 3, undefined as unknown as Color)).toThrow(/colour/);
    expect(() => p.disc([4, 4], missing, hex('4e5f78'))).toThrow(/disc/);
    expect(() => p.tintToward([1, 0], hex('4e5f78'), missing)).toThrow(/depth/);
  });
});

describe('grade and shadow declarations', () => {
  it('a shadow declared with the wrong field names throws instead of vanishing', () => {
    // The knight declared { color, opacity, radiusX, radiusY }. It compiled,
    // baked, passed every gate, and had no ground shadow.
    const wrong = { color: hex('151922'), opacity: 0.38, radiusX: 22, radiusY: 5 };
    const broken = { ...spec, shadow: wrong as unknown as typeof spec.shadow };
    expect(() => bakeRest(broken)).toThrow(/shadow\.x/);
    expect(() => bakeClip(broken, 'idle')).toThrow(/shadow\.x/);
    expect(() => bakeRest(spec)).not.toThrow();
  });

  it('a grade missing ink or emissiveLone throws', () => {
    const noInk = { ...spec, grade: { ...spec.grade, ink: undefined as unknown as Color } };
    expect(() => bakeRest(noInk)).toThrow(/grade\.ink/);
    const noList = { ...spec, grade: { ...spec.grade, emissiveLone: hex('ffffff') as unknown as Color[] } };
    expect(() => bakeRest(noList)).toThrow(/emissiveLone/);
  });
});

describe('polygon', () => {
  it('fills a concave outline and rejects a degenerate one', () => {
    // An arrow: the notch must stay empty, which is what capsules cannot do.
    const p = new Paint({ x: 0, y: 0, w: 20, h: 20 });
    p.polygon([[10, 1], [19, 18], [10, 13], [1, 18]], hex('4e5f78'));
    expect(p.img.alpha(10, 4)).toBeGreaterThan(0.5); // inside the head
    expect(p.img.alpha(10, 17)).toBeLessThan(0.5); // inside the notch
    expect(() => p.polygon([[0, 0], [4, 4]], hex('4e5f78'))).toThrow(/at least two points|three/);
    expect(() => p.polygon([[0, 0], [4, 0], [4, 4]], 3 as unknown as Color)).toThrow(/colour/);
  });

  it('a horizontal edge on a scanline fills once, not twice', () => {
    // Even-odd counting a vertex on both its edges leaves holes; a flat-topped
    // helmet crown is exactly that case.
    const p = new Paint({ x: 0, y: 0, w: 12, h: 12 });
    p.polygon([[2, 2], [10, 2], [10, 9], [2, 9]], hex('4e5f78'));
    for (let y = 3; y <= 8; y++) expect(p.img.alpha(6, y)).toBeGreaterThan(0.5);
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
