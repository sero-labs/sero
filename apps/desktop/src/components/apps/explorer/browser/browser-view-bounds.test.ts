import { describe, expect, it } from 'vitest';
import { toBrowserViewBounds } from './browser-view-bounds';

describe('toBrowserViewBounds', () => {
  it('converts renderer CSS coordinates to Electron DIP bounds using page zoom', () => {
    expect(toBrowserViewBounds({ left: 10, top: 20, width: 300, height: 200 }, 2)).toEqual({
      x: 20,
      y: 40,
      width: 600,
      height: 400,
    });
  });

  it('falls back to 100% zoom for invalid factors', () => {
    expect(toBrowserViewBounds({ left: 10, top: 20, width: 300, height: 200 }, Number.NaN)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });
  });
});
