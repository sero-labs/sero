import { describe, expect, it } from 'vitest';

import { enclosedBackground, floodForeground } from './key';
import type { SourceImage } from './types';

/**
 * Background the drawing has closed around.
 *
 * A flood fill enters from the border, so it never reaches inside a ring. With
 * a picture that carries real transparency none of this arises — the space is
 * already transparent. With a background that was **painted on**, the pockets
 * survive as solid paint and the sprite comes out with its holes filled in.
 *
 * Which is why they are found here but taken out only when asked: a ring's
 * middle and the white of an eye are the same white, and the picture cannot say
 * which is which (D7).
 */

/** A ring drawn on white, with a small white dot elsewhere inside the body. */
function ring({ dot = false } = {}): SourceImage {
  const width = 40;
  const height = 40;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const ink = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    data[i] = 20;
    data[i + 1] = 40;
    data[i + 2] = 30;
  };
  // A thick annulus: its middle is background, and unreachable from the border.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(x - 20, y - 20);
      if (r >= 8 && r <= 16) ink(x, y);
    }
  if (dot) {
    // Something white the artist drew, enclosed by ink: an eye.
    for (let y = 11; y <= 12; y++) for (let x = 19; x <= 20; x++) ink(x, y);
    const i = (11 * width + 19) * 4;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
  }
  return { width, height, data };
}

describe('finding background the fill cannot reach', () => {
  it('finds the middle of a ring, and leaves the outside alone', () => {
    const image = ring();
    const found = enclosedBackground(image, floodForeground(image));

    expect(found.regions).toBe(1);
    expect(found.pixels).toBeGreaterThan(100);
    // The pocket is the middle, not the page around the ring.
    expect(found.mask[20 * 40 + 20]).toBe(1);
    expect(found.mask[0]).toBe(0);
  });

  it('finds nothing in a picture that carries its own transparency', () => {
    // The reference PNG behaves this way, which is why this never came up
    // until a picture with a painted background was used.
    const image = ring();
    for (let i = 0; i < image.width * image.height; i++) {
      const white =
        (image.data[i * 4] ?? 0) > 226 &&
        (image.data[i * 4 + 1] ?? 0) > 226 &&
        (image.data[i * 4 + 2] ?? 0) > 226;
      if (white) image.data[i * 4 + 3] = 0;
    }

    expect(enclosedBackground(image, floodForeground(image)).regions).toBe(0);
  });

  it('cannot tell an eye from a hole, which is why it only reports', () => {
    // Both pockets are found and neither is judged. A rule that removed the
    // big one and kept the small one would be a guess about what the artist
    // drew, and on a real reference the sizes ran 30, 27, 11, 7 … 2 with
    // nothing in between to cut on.
    const image = ring({ dot: true });
    const found = enclosedBackground(image, floodForeground(image));

    expect(found.regions).toBe(2);
  });
});
