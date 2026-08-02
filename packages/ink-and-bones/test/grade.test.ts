import { describe, expect, it } from 'vitest';
import type { Color, Part } from '../src/index';
import {
  Img,
  Paint,
  Skeleton,
  colorKey,
  despeckle,
  offVocabPx,
  renderPose,
  sameColor,
  specklePx,
} from '../src/index';
import { INK, SASH, SUIT, SUIT_DARK, SUIT_LIGHT, fillRect, mix } from './helpers';

describe('grade', () => {
  // A one-bone puppet painted in colours BETWEEN ramp stops: the grade must
  // emit only ramp colours + INK, despeckled, outlined.
  function gradedLimb(): Img {
    const s = new Skeleton();
    s.rootPos = [32, 24];
    s.bone('a', '', [0, 0], 20, 40);
    const ramp: Color[] = [SUIT_LIGHT, SUIT, SUIT_DARK];
    const p = new Paint({ x: -10, y: -4, w: 20, h: 52 });
    p.capsule([0, 0], [0, 44], 7, 4, mix(SUIT, SUIT_LIGHT, 0.4));
    p.tintToward([1, 0], mix(SUIT, SUIT_DARK, 0.6), 3);
    const parts: Part[] = [{ name: 'a', bone: 'a', paint: p, ramp }];
    return renderPose(s, parts, { deg: {} }, 20, 20, {
      ink: INK,
      shadow: [0, 0, 0, 0.45],
      emissiveLone: [],
    });
  }

  it('every output pixel is ramp or INK', () => {
    const vocab = new Set([colorKey(INK), colorKey(SUIT_LIGHT), colorKey(SUIT), colorKey(SUIT_DARK)]);
    expect(offVocabPx(gradedLimb(), vocab)).toBe(0);
  });

  it('no speckle on a rotated limb', () => {
    expect(specklePx(gradedLimb(), INK)).toBe(0);
  });

  it('the silhouette got an INK outline', () => {
    const img = gradedLimb();
    let ink = 0;
    let fill = 0;
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const c = img.get(x, y);
        if (c[3] < 0.5) continue;
        if (sameColor(c, INK)) ink++;
        else fill++;
      }
    }
    expect(ink).toBeGreaterThan(10);
    expect(fill).toBeGreaterThan(20);
  });

  it('despeckle snaps a lone pixel to its neighbours', () => {
    const d = new Img(8, 8);
    fillRect(d, 1, 1, 6, 6, SUIT);
    d.set(3, 3, SASH);
    despeckle(d, []);
    expect(sameColor(d.get(3, 3), SUIT)).toBe(true);
  });
});

describe('crisp artwork', () => {
  /** A checkerboard of two colours on one bone, rendered at `deg`. */
  function board(deg: number, crisp: boolean): Img {
    const s = new Skeleton();
    s.rootPos = [40 * 4, 40 * 4];
    s.bone('b', '', [0, 0], deg, 40);
    const art = new Img(12, 12);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) art.set(x, y, (x + y) % 2 === 0 ? SUIT_LIGHT : SUIT_DARK);
    }
    const paint = new Paint({ x: -24, y: -24, w: 48, h: 48 });
    paint.image(art, [-24, -24], 4);
    const parts: Part[] = [{ name: 'art', bone: 'b', ramp: [SUIT_LIGHT, SUIT_DARK], paint, ...(crisp ? { crisp: true } : {}) }];
    return renderPose(s, parts, { deg: {} }, 80, 80, {
      ink: INK,
      shadow: INK,
      emissiveLone: [],
      despeckle: false,
      outline: false,
    });
  }

  it('keeps a rotated piece made of the colours it was made of', () => {
    // Turned 17 degrees, a checkerboard's pixels no longer line up with the 1x
    // grid. Averaging them lands halfway between the two colours and snaps to
    // whichever is nearer — the "pixel mulch" a rigged character showed. Taking
    // the colour most of the cell already is cannot invent anything.
    const crisp = board(17, true);
    let light = 0;
    let dark = 0;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        if (crisp.alpha(x, y) < 0.5) continue;
        if (sameColor(crisp.get(x, y), SUIT_LIGHT)) light++;
        else if (sameColor(crisp.get(x, y), SUIT_DARK)) dark++;
        else throw new Error(`crisp emitted ${colorKey(crisp.get(x, y))}, which is not in the artwork`);
      }
    }
    // Both colours survive in roughly the proportion they were drawn in; the
    // failure this guards is one of them being averaged out of existence.
    expect(light).toBeGreaterThan(30);
    expect(dark).toBeGreaterThan(30);
  });

  it('leaves a piece that is not marked crisp on the smooth path', () => {
    // The default has to stay the default: painted parts still average and
    // snap, which is what makes generous painted shapes into pixel art.
    const smooth = board(17, false);
    let drawn = 0;
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (smooth.alpha(x, y) >= 0.5) drawn++;
    expect(drawn).toBeGreaterThan(0);
  });
});
