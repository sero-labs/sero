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
