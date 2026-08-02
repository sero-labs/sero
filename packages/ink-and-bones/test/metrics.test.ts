/** The graded-pixel checks must FIRE on deliberately broken images, or the
 * audit's green means nothing. */
import { describe, expect, it } from 'vitest';
import { Img, colorKey, cxWobble, edgeFill, islands, offVocabPx, pocketPx, specklePx } from '../src/index';
import { INK, SASH, SUIT, fillRect } from './helpers';

describe('fixtures', () => {
  function lonePixel(): Img {
    const img = new Img(10, 10);
    fillRect(img, 2, 2, 6, 6, SUIT);
    img.set(4, 4, SASH);
    return img;
  }

  it('the speckle check fires on a lone pixel', () => {
    expect(specklePx(lonePixel(), INK)).toBe(1);
  });

  it('the speckle whitelist admits a hot core', () => {
    expect(specklePx(lonePixel(), INK, [SASH])).toBe(0);
  });

  it('the ramp-bleed check fires on an off-vocab pixel', () => {
    expect(offVocabPx(lonePixel(), new Set([colorKey(SUIT)]))).toBe(1);
  });

  it('cx_wobble flags a sideways walk', () => {
    expect(cxWobble([10, 11, 14, 17])).toBeGreaterThan(2.5);
  });

  it('the islands check fires on a detached piece', () => {
    const img = new Img(12, 12);
    fillRect(img, 1, 1, 4, 4, SUIT);
    fillRect(img, 8, 8, 3, 3, SUIT);
    expect(islands(img)).toBe(2);
  });

  it('the pocket check fires on a sealed hole', () => {
    const img = new Img(10, 10);
    fillRect(img, 1, 1, 8, 8, SUIT);
    img.set(4, 4, [0, 0, 0, 0]);
    expect(pocketPx(img)).toBe(1);
  });

  it('the edge check fires on boundary fill and exempts the bottom row', () => {
    const img = new Img(8, 8);
    fillRect(img, 0, 0, 8, 1, SUIT); // top row: fires
    fillRect(img, 0, 7, 8, 1, SUIT); // bottom row: exempt
    const e = edgeFill(img, INK);
    expect(e.top).toBe(8);
    // the bottom-row fill touches both side columns — that is all the sides see
    expect(e.left).toBe(2);
    expect(e.right).toBe(2);
  });
});
