import { describe, expect, it } from 'vitest';

import { BoundedImageCache } from './image-cache';

describe('bounded image cache', () => {
  it('evicts the oldest image rather than growing with the Gallery', () => {
    const cache = new BoundedImageCache(3);
    cache.set('one', '1');
    cache.set('two', '2');
    cache.set('three', '3');
    cache.set('four', '4');

    expect(cache.size).toBe(3);
    expect(cache.get('one')).toBeUndefined();
    expect(cache.get('four')).toBe('4');
  });
});
