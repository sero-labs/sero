import { describe, expect, it } from 'vitest';

import { buildFalInput } from './fal-input';

describe('fal image-to-video input', () => {
  it('sends the source image and normalized video controls', () => {
    expect(
      buildFalInput(
        {
          capability: 'image-to-video',
          prompt: 'a slow push in',
          sourceAssetIds: ['reference'],
          durationSeconds: 5,
          aspectRatio: '16:9',
        },
        ['https://fal.media/source.png'],
        new Map([[5, '5']]),
      ),
    ).toEqual({
      prompt: 'a slow push in',
      image_url: 'https://fal.media/source.png',
      duration: '5',
      aspect_ratio: '16:9',
    });
  });

  it('omits aspect ratio when the endpoint schema does not accept it', () => {
    expect(
      buildFalInput(
        {
          capability: 'image-to-video',
          prompt: 'a slow push in',
          sourceAssetIds: ['reference'],
          aspectRatio: '16:9',
        },
        ['https://fal.media/source.png'],
        new Map(),
        false,
      ),
    ).toEqual({
      prompt: 'a slow push in',
      image_url: 'https://fal.media/source.png',
    });
  });
});
