import { describe, expect, it } from 'vitest';

import { clipKey, frameDurations, sampleTimes } from './clip-frames';

/**
 * Where a clip is sampled, and what each sample is worth.
 *
 * This is the only path from a finished clip to a compiled animation, so the
 * arithmetic is worth pinning down without a decoder: a sample past the end of
 * the clip produces nothing, two samples at the same moment produce the same
 * drawing twice, and a duration that does not come from the sample times would
 * quietly replace the source's timing with a nominal one (D23).
 */

describe('where a clip is sampled', () => {
  it('starts at the first frame and steps at the sample rate', () => {
    const times = sampleTimes(1, 4);
    expect(times).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('never seeks past the end, where a clip is often undecodable', () => {
    const times = sampleTimes(5, 12);
    expect(times.at(-1)).toBeLessThan(5);
    expect(times).toHaveLength(60);
  });

  it('takes no more frames than the clip holds, however many were expected', () => {
    // A five second clip at 12 fps holds sixty; asking for a hundred would seek
    // to the same moment forty times and stage the same drawing forty times.
    expect(sampleTimes(5, 12, 100)).toHaveLength(60);
    expect(sampleTimes(5, 12, 10)).toHaveLength(10);
  });

  it('has nothing to sample from a clip with no duration', () => {
    expect(sampleTimes(0, 12)).toEqual([]);
    expect(sampleTimes(Number.NaN, 12)).toEqual([]);
    expect(sampleTimes(5, 0)).toEqual([]);
  });
});

describe('how long each sampled frame held', () => {
  it('is the gap to the next sample', () => {
    expect(frameDurations([0, 0.25, 0.5], 1)).toEqual([250, 250, 500]);
  });

  it('gives the last frame the rest of the clip rather than a nominal tick', () => {
    const times = sampleTimes(1, 4);
    const durations = frameDurations(times, 1);
    expect(durations.reduce((total, ms) => total + ms, 0)).toBe(1000);
  });

  it('never records a frame as held for no time', () => {
    expect(frameDurations([0, 0], 0)).toEqual([1, 1]);
  });
});

describe('deciding a clip has already been done', () => {
  it('keys on the clip as well as the animation, so a redo is decoded again', () => {
    expect(clipKey({ animationId: 'a', clipPath: 'one.mp4' })).not.toBe(
      clipKey({ animationId: 'a', clipPath: 'two.mp4' }),
    );
    expect(clipKey({ animationId: 'a', clipPath: 'one.mp4' })).toBe(
      clipKey({ animationId: 'a', clipPath: 'one.mp4' }),
    );
  });
});
