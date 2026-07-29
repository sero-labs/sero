import { describe, expect, it } from 'vitest';

import { FILMSTRIP_FRAMES, sampleTimes } from './video-frames';

/**
 * Where the filmstrip samples from.
 *
 * The decode itself needs a browser, but *which moments* is arithmetic, and it
 * is the part with a wrong answer worth guarding: sampling from zero produces a
 * poster of the black lead-in that most generated clips start with, which is
 * worse than having no poster at all.
 */

describe('sampling a clip', () => {
  it('avoids the very start and the very end', () => {
    const times = sampleTimes(10);

    expect(times).toHaveLength(FILMSTRIP_FRAMES);
    expect(times[0]).toBeGreaterThan(0);
    expect(times.at(-1)).toBeLessThan(10);
  });

  it('spreads the samples evenly so the strip reads as a progression', () => {
    const times = sampleTimes(10);
    const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));

    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0);
  });

  it('stays in order', () => {
    const times = sampleTimes(4);

    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('survives a duration the browser could not work out', () => {
    // A clip whose metadata reports `Infinity` or `NaN` still gets a capture
    // attempt rather than seeking to a nonsense time.
    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      const times = sampleTimes(duration);
      expect(times, String(duration)).toHaveLength(FILMSTRIP_FRAMES);
      expect(times.every((time) => Number.isFinite(time)), String(duration)).toBe(true);
    }
  });

  it('asks for a single moment when only one is wanted', () => {
    expect(sampleTimes(10, 1)).toHaveLength(1);
  });
});
