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

/**
 * A dark shape on a light page, with the boundary smeared into a long ramp.
 *
 * The ramp matters and its steepness matters: each step along it is under the
 * fill's step tolerance, so a step-by-step test alone chains all the way
 * through. A single-pixel edge would not reproduce this — the fill stops at a
 * cliff. It is the gentle slope that lets it walk in.
 */
const PAGE = 238;
const SHAPE = 60;

function softShape(): SourceImage {
  const width = 60;
  const height = 60;
  const data = new Uint8Array(width * height * 4);
  const ramp = 15;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      // How far outside the solid block this pixel is.
      const out = Math.max(0, 20 - x, x - 39, 20 - y, y - 39);
      const value =
        out === 0 ? SHAPE : out >= ramp ? PAGE : SHAPE + Math.round((out / ramp) * (PAGE - SHAPE));
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  return { width, height, data };
}

describe('a fill on a picture whose edges are soft', () => {
  it('stops at the boundary instead of walking through it', () => {
    // Each step down the ramp is small, so a step-by-step test alone chains
    // through the edge and eats what is behind it. It took the insides out of
    // a character's boots that way and left a clean cut across both legs.
    const image = softShape();
    const foreground = floodForeground(image);

    // The middle of the shape is the shape, not the page.
    expect(foreground[30 * 60 + 30]).toBe(1);
    // And the page is still the page.
    expect(foreground[0]).toBe(0);
    expect(foreground[59 * 60 + 59]).toBe(0);
  });
});

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
