import { describe, expect, it } from 'vitest';

import { detectArtGrid } from './art-grid';
import type { Rgb, SourceImage } from './types';

/**
 * Reading the grid off an ordinary saved file.
 *
 * The first version of this asked whether every colour edge lands on one
 * **exact** position. Artwork exported by anything real — an image host, a
 * screenshot, an editor that resampled on the way out — has boundaries a pixel
 * wide rather than infinitely sharp, so each one is found twice, once each
 * side. Half the edges then miss, the answer comes back "no grid", and a
 * perfectly ordinary piece of pixel art is refused with the file blamed for it.
 */

/** A checkerboard of art pixels, enlarged by `block`, optionally softened. */
function artwork({
  cols = 24,
  rows = 24,
  block = 8,
  soft = false,
}): SourceImage {
  const width = cols * block;
  const height = rows * block;
  const data = new Uint8Array(width * height * 4);
  const shade = (col: number, row: number): Rgb =>
    (col + row) % 2 === 0 ? [30, 160, 60] : [200, 60, 40];

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = shade(Math.floor(x / block), Math.floor(y / block));
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }

  if (soft) {
    // Every boundary becomes a two pixel ramp, which is what a resample does.
    const copy = Uint8Array.from(data);
    const at = (x: number, y: number, c: number): number =>
      copy[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4 + c] ?? 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++) {
          data[(y * width + x) * 4 + c] = Math.round(
            (at(x - 1, y, c) + at(x, y, c) * 2 + at(x + 1, y, c)) / 4,
          );
        }
  }

  return { width, height, data };
}

const whole = (image: SourceImage) => ({
  minX: 0,
  minY: 0,
  maxX: image.width - 1,
  maxY: image.height - 1,
});

describe('artwork with hard edges', () => {
  it('is read exactly, and says so', () => {
    const image = artwork({ block: 8 });
    const grid = detectArtGrid(image, whole(image));

    expect(grid.block).toBe(8);
    expect(grid.sharp).toBe(true);
    expect(grid.lift).toBeCloseTo(8, 0);
  });
});

describe('artwork whose edges have been softened', () => {
  it('is still read at its real cell size', () => {
    // The case that sent a real reference back to the user as "not pixel art".
    const image = artwork({ block: 8, soft: true });
    const grid = detectArtGrid(image, whole(image));

    expect(grid.block).toBe(8);
  });

  it('is marked as recovered rather than measured', () => {
    // A rescue and a clean read must not look the same on the character sheet.
    const image = artwork({ block: 8, soft: true });
    const grid = detectArtGrid(image, whole(image));

    expect(grid.sharp).toBe(false);
    // The lift still reports how sharp the picture was, not how hard we looked.
    expect(grid.lift).toBeLessThan(8);
  });
});

describe('artwork that is already at its true size', () => {
  it('is left alone, at both tolerances', () => {
    // The fault the tolerance nearly introduced: a pixel either side of a grid
    // of 2 is every pixel there is, so a careless tolerant test reports 2 for
    // artwork drawn 1:1 and throws away every other pixel of the character.
    const image = artwork({ cols: 40, rows: 40, block: 1 });
    expect(detectArtGrid(image, whole(image)).block).toBe(1);

    const softened = artwork({ cols: 40, rows: 40, block: 1, soft: true });
    expect(detectArtGrid(softened, whole(softened)).block).toBe(1);
  });
});
