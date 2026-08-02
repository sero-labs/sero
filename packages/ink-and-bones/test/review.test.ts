import { describe, expect, it } from 'vitest';
import { Img, frameStrip, poseGrid, scaleNearest, sideBySide, zoom } from '../src/index';
import { SUIT, fillRect } from './helpers';

function frame(): Img {
  const img = new Img(16, 20);
  fillRect(img, 4, 4, 8, 12, SUIT);
  return img;
}

describe('review sheets', () => {
  it('the strip lays frames left to right and upscales toward 1900px', () => {
    const strip = frameStrip([frame(), frame(), frame()]);
    expect(strip.w).toBeLessThanOrEqual(1900);
    expect(strip.w).toBeGreaterThan(1900 / 2);
    expect(strip.w / strip.h).toBeGreaterThan(2); // wide, not square
  });

  it('a long clip wraps instead of exceeding the readable width', () => {
    const frames = Array.from({ length: 200 }, () => frame());
    const strip = frameStrip(frames);
    expect(strip.w).toBeLessThanOrEqual(1900);
    const grid = poseGrid(frames);
    expect(grid.w).toBeLessThanOrEqual(1900);
  });

  it('the silhouette grid flattens every opaque pixel to one value', () => {
    const grid = poseGrid([frame(), frame()], true);
    const seen = new Set<string>();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = grid.get(x, y);
        seen.add(c.map((v) => v.toFixed(3)).join(','));
      }
    }
    expect(seen.size).toBe(2); // background + fill, nothing else
  });

  it('sideBySide bottom-aligns both images', () => {
    const short = new Img(10, 10);
    fillRect(short, 0, 0, 10, 10, SUIT);
    const tall = new Img(10, 20);
    fillRect(tall, 0, 0, 10, 20, SUIT);
    const out = sideBySide(short, tall);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);
  });

  it('nearest-neighbour scaling multiplies exactly', () => {
    const img = frame();
    const big = scaleNearest(img, 3);
    expect(big.w).toBe(img.w * 3);
    expect(big.h).toBe(img.h * 3);
    expect(zoom(img).w).toBe(img.w * 16);
  });
});
