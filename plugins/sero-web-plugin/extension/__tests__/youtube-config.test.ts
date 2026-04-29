import { describe, expect, it } from 'vitest';
import { isYouTubeURL } from '../youtube-config';

describe('youtube URL detection', () => {
  it('recognizes standard and short YouTube watch URLs', () => {
    expect(isYouTubeURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      isYouTube: true,
      videoId: 'dQw4w9WgXcQ',
    });
    expect(isYouTubeURL('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      isYouTube: true,
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('ignores playlist-only URLs that do not identify a single video', () => {
    expect(isYouTubeURL('https://www.youtube.com/playlist?list=PL123')).toEqual({
      isYouTube: false,
      videoId: null,
    });
  });
});
