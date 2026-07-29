import { describe, expect, it } from 'vitest';

import { DEFAULT_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from './media';
import { allowedDurations, settleMediaRequest, videoLengthRefusal } from './media-options';

/**
 * Settling a request against what the model takes.
 *
 * Every case here is a request that would otherwise be refused by the provider —
 * costing nothing and producing nothing, which is the failure mode this whole
 * mechanism exists to remove.
 */

const video: { capability: 'text-to-video'; prompt: string; durationSeconds?: number; aspectRatio?: string } =
  { capability: 'text-to-video', prompt: 'a slow pan' };
const fixed = { durationsSeconds: [5, 10] };

describe('lengths on offer', () => {
  it('lists what the model states, shortest first', () => {
    expect(allowedDurations({ durationsSeconds: [10, 5] })).toEqual([5, 10]);
  });

  it('turns a range into a few real choices', () => {
    expect(allowedDurations({ durationRange: { min: 2, max: 6 } })).toEqual([2, 4, 6]);
  });

  it('says nothing rather than inventing a list', () => {
    expect(allowedDurations(undefined)).toBeNull();
    expect(allowedDurations({ aspectRatios: ['16:9'] })).toBeNull();
  });
});

describe('settling a video request', () => {
  it('moves a length the model will not take to the nearest it will', () => {
    expect(settleMediaRequest({ ...video, durationSeconds: 4 }, fixed).durationSeconds).toBe(5);
    expect(settleMediaRequest({ ...video, durationSeconds: 8 }, fixed).durationSeconds).toBe(10);
  });

  it('fills in a default when nobody asked for a length', () => {
    expect(settleMediaRequest(video, fixed).durationSeconds).toBe(DEFAULT_VIDEO_SECONDS);
  });

  it('keeps our own ceiling wherever the model leaves room', () => {
    const options = { durationsSeconds: [5, 10, 30] };
    expect(settleMediaRequest({ ...video, durationSeconds: 60 }, options).durationSeconds).toBe(10);
  });

  it('refuses a model whose every clip is longer than the ceiling', () => {
    // The ceiling is the promise that one press cannot spend more than a known
    // amount. Buying the model's shortest clip anyway would break that promise
    // precisely where it matters.
    const options = { durationsSeconds: [20, 40] };
    expect(allowedDurations(options)).toEqual([]);
    expect(videoLengthRefusal('text-to-video', options)).toContain(String(MAX_VIDEO_SECONDS));
  });

  it('refuses nothing when the model has a length we will buy', () => {
    expect(videoLengthRefusal('text-to-video', { durationsSeconds: [5, 20] })).toBeNull();
    // Unknown options are not a refusal: the request goes out as asked.
    expect(videoLengthRefusal('text-to-video', undefined)).toBeNull();
    // And a still image is never refused for its length.
    expect(videoLengthRefusal('text-to-image', { durationsSeconds: [20] })).toBeNull();
  });

  it('leaves an unstated length alone when the model could not be asked', () => {
    expect(settleMediaRequest(video).durationSeconds).toBeUndefined();
    expect(settleMediaRequest({ ...video, durationSeconds: 90 }).durationSeconds).toBe(
      MAX_VIDEO_SECONDS,
    );
  });

  it('moves an aspect ratio to the closest shape the model can produce', () => {
    const options = { aspectRatios: ['16:9', '9:16', '1:1'] };
    // Landscape stays landscape: falling back to the model's own default would
    // be further from what was asked for than the option sitting right there.
    expect(settleMediaRequest({ ...video, aspectRatio: '3:2' }, options).aspectRatio).toBe('16:9');
    expect(settleMediaRequest({ ...video, aspectRatio: '9:16' }, options).aspectRatio).toBe('9:16');
  });

  it('drops a length from anything that is not a video', () => {
    const settled = settleMediaRequest(
      { capability: 'text-to-image' as const, prompt: 'a hero', durationSeconds: 5 },
      fixed,
    );

    // Noise in the record and in the parameters sent to the provider.
    expect('durationSeconds' in settled).toBe(false);
  });
});
