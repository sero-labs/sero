/**
 * Separating the character from what it was drawn on.
 *
 * Two routes, because there are two kinds of picture (D7):
 *
 *  - Everything **we** generate is drawn on flat magenta, a colour that appears
 *    nowhere on a character. Keying is then a per-pixel test with no
 *    connectivity rule and no guessing, so a hole the character encloses — the
 *    gap inside a coiled whip — comes out transparent like any other background.
 *  - A picture the **user** supplies is on whatever they had. There the
 *    background is flood filled inwards from the border, so a background-coloured
 *    region the character encloses — the whites of the eyes — is not eaten.
 */

import type { Foreground, Rgb, SourceImage } from './types';

export const MAGENTA: readonly [number, number, number] = [255, 0, 255];

/** Foreground by the magenta key, with detached matter dropped (D35). */
export function keyForeground(image: SourceImage): Foreground {
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) {
    const r = image.data[i * 4] ?? 0;
    const g = image.data[i * 4 + 1] ?? 0;
    const b = image.data[i * 4 + 2] ?? 0;
    const key =
      Math.abs(r - MAGENTA[0]) + Math.abs(g - MAGENTA[1]) + Math.abs(b - MAGENTA[2]) < 90 ||
      (r > 150 && b > 150 && g < 90 && Math.abs(r - b) < 70);
    mask[i] = key ? 0 : 1;
  }
  return mask;
}

/** True when the picture already says which pixels are background. */
export function hasAlpha(image: SourceImage): boolean {
  for (let i = 0; i < image.width * image.height; i++) {
    if ((image.data[i * 4 + 3] ?? 255) < 128) return true;
  }
  return false;
}

/**
 * Foreground from the picture's own alpha channel.
 *
 * Preferred over the flood fill whenever there is one, because it is exact
 * rather than inferred — and because the flood fill has a failure the alpha
 * channel does not: a sprite cropped tightly to its own edges has the character
 * *on* the border, so filling inwards from the border starts inside him and
 * eats his edge. A 62 × 136 reference came back as 60 × 115 that way, and the
 * missing rows were his hat and his boots.
 */
export function alphaForeground(image: SourceImage): Foreground {
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = (image.data[i * 4 + 3] ?? 255) >= 128 ? 1 : 0;
  return mask;
}

/**
 * The commonest colour along the border: what the fill is spreading out of.
 *
 * All four edges. Counting the top and bottom rows alone read a tall picture
 * from its two shortest sides — on a 62 × 136 reference that is under a third
 * of the border — so a character reaching the top and the bottom could decide
 * what the page colour was, and the fill then spread out of the character.
 */
export function borderColour(image: SourceImage): Rgb {
  const { width, height, data } = image;
  const at = (i: number): Rgb => [data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0];
  const tally = new Map<string, number>();
  const count = (i: number): void => {
    const key = at(i).join();
    tally.set(key, (tally.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) {
    count(x);
    count((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    count(y * width);
    count(y * width + width - 1);
  }
  let found: Rgb = [255, 255, 255];
  let most = 0;
  for (const [key, tallied] of tally) {
    if (tallied <= most) continue;
    most = tallied;
    const parts = key.split(',').map(Number);
    found = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  return found;
}

/**
 * Foreground for a picture we did not draw: flood fill inwards from the border.
 *
 * A colour test alone would eat the whites of the character's eyes, so
 * background is defined as "reachable from the edge without crossing a colour
 * boundary" rather than as a colour.
 *
 * **And it has to still look like the background.** A step-by-step test alone
 * walks down a gradient: on a picture whose edges are soft — anything saved by
 * an ordinary tool — each step across the two pixel ramp from the page into the
 * character is small, so the fill chains through the boundary and eats what is
 * behind it. It took the insides out of a character's boots that way, leaving
 * the outline standing and a clean cut across both legs.
 *
 * Measured on that file: 96% of what the fill took sat within 50 of the page's
 * own colour, nothing at all between 250 and 450, and 4% out past 450 — the
 * boots. `reach` sits in that gap. Its failure is the safe way round: too tight
 * leaves background in the sprite, where it is plain to see, rather than
 * quietly removing the character.
 */
export function floodForeground(
  image: SourceImage,
  { tolerance = 40, reach = 150, pageMatch = 90 } = {},
): Foreground {
  const { width, height } = image;
  const total = width * height;
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const page = borderColour(image);

  const push = (at: number, from: number): void => {
    if (background[at]) return;
    const a = at * 4;
    const b = from * 4;
    const distance =
      Math.abs((image.data[a] ?? 0) - (image.data[b] ?? 0)) +
      Math.abs((image.data[a + 1] ?? 0) - (image.data[b + 1] ?? 0)) +
      Math.abs((image.data[a + 2] ?? 0) - (image.data[b + 2] ?? 0));
    const strayed =
      Math.abs((image.data[a] ?? 0) - page[0]) +
      Math.abs((image.data[a + 1] ?? 0) - page[1]) +
      Math.abs((image.data[a + 2] ?? 0) - page[2]);
    // A step is allowed when the pixel looks like its neighbour OR when it
    // looks like the page closely in its own right.
    //
    // The neighbour test alone is what stops the fill walking down a soft
    // gradient into the character, and it must stay. But it also refuses a
    // backdrop made of two alternating tones: a transparency checkerboard
    // flattened into a JPEG steps 75 between its greys against a tolerance of
    // 40, so only the squares touching the border came off and the rest of it
    // went into the sprite as foreground.
    //
    // `pageMatch` cannot walk anywhere, because it is measured from a fixed
    // colour rather than from wherever the last step landed, and it sits in
    // the gap the boots measurement already found: 96% of legitimate
    // background within 50 of the page, nothing at all between 250 and 450,
    // the character's own dark colours out past 450.
    if (distance > tolerance && strayed > pageMatch) return;
    if (strayed > reach) return;
    background[at] = 1;
    queue[tail++] = at;
  };

  // Seed only the border pixels that look like the page.
  //
  // Taking every border pixel assumed the character never reaches the edge, and
  // a picture cropped tight to its own artwork breaks that assumption on the
  // first row: the fill starts *inside* the character and eats outwards. That
  // is the same fault the alpha route exists to avoid, and it is worse here
  // because there is no alpha channel to fall back to.
  const seed = (at: number): void => {
    if (background[at]) return;
    const i = at * 4;
    const strayed =
      Math.abs((image.data[i] ?? 0) - page[0]) +
      Math.abs((image.data[i + 1] ?? 0) - page[1]) +
      Math.abs((image.data[i + 2] ?? 0) - page[2]);
    if (strayed > reach) return;
    background[at] = 1;
    queue[tail++] = at;
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  while (head < tail) {
    const at = queue[head++] ?? 0;
    const x = at % width;
    const y = (at - x) / width;
    if (x > 0) push(at - 1, at);
    if (x < width - 1) push(at + 1, at);
    if (y > 0) push(at - width, at);
    if (y < height - 1) push(at + width, at);
  }

  const foreground = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    // A pixel the source already declared transparent is background whatever
    // the fill reached, so an image that arrives with an alpha channel keeps it.
    const opaque = (image.data[i * 4 + 3] ?? 255) >= 128;
    foreground[i] = !background[i] && opaque ? 1 : 0;
  }
  return foreground;
}

export interface EnclosedBackground {
  /** True where a pixel is background the fill could not get to. */
  mask: Uint8Array;
  /** How many separate pockets there are. */
  regions: number;
  pixels: number;
}

/**
 * Background the drawing has closed around — and why it cannot be assumed.
 *
 * A flood fill enters from the border, so it never reaches the inside of a
 * coiled whip or the gap between an arm and a body. In a file with real
 * transparency that space is already transparent and none of this arises. In a
 * picture whose background was **painted on**, those pockets survive as solid
 * paint, and the sprite comes out with holes filled in.
 *
 * They are found here and removed only when asked, because the picture cannot
 * say which they are: white showing through a gap and white the artist drew are
 * the same white. Measured on a real reference the pockets ran 30, 27, 11, 7,
 * 7, 6, 4, 4, 4, 3, 3 and 2 art pixels — the whip's coil at one end and
 * something eye-sized at the other, with nothing in between to cut on. So the
 * user is shown what there is and decides (D7).
 */
export function enclosedBackground(
  image: SourceImage,
  foreground: Foreground,
  { tolerance = 40 } = {},
): EnclosedBackground {
  const { width, height, data } = image;
  const total = width * height;
  const mask = new Uint8Array(total);
  const border = borderColour(image);
  const colourAt = (i: number): Rgb => [
    data[i * 4] ?? 0,
    data[i * 4 + 1] ?? 0,
    data[i * 4 + 2] ?? 0,
  ];

  const looksLikeBackground = (i: number): boolean => {
    if (!foreground[i]) return false;
    const [r, g, b] = colourAt(i);
    return (
      Math.abs(r - border[0]) + Math.abs(g - border[1]) + Math.abs(b - border[2]) <= tolerance
    );
  };

  // Every pocket is enclosed by construction: a border pixel is always seeded
  // as background by the fill, so it can never be foreground and never lands
  // here.
  let regions = 0;
  let pixels = 0;
  const queue: number[] = [];
  const visit = (at: number): void => {
    if (mask[at] === 1 || !looksLikeBackground(at)) return;
    mask[at] = 1;
    pixels += 1;
    queue.push(at);
  };

  for (let start = 0; start < total; start++) {
    if (mask[start] === 1 || !looksLikeBackground(start)) continue;
    regions += 1;
    visit(start);
    while (queue.length > 0) {
      const at = queue.pop() ?? 0;
      const x = at % width;
      const y = (at - x) / width;
      if (x > 0) visit(at - 1);
      if (x < width - 1) visit(at + 1);
      if (y > 0) visit(at - width);
      if (y < height - 1) visit(at + width);
    }
  }

  return { mask, regions, pixels };
}

/**
 * Keep the character and drop everything else the key let through (D35).
 *
 * Grok draws a soft shadow on the ground under the character, despite being
 * told not to. It is washed-out magenta — far enough from the key colour to
 * survive it, and detached from the body. Left in, it becomes the lowest part
 * of the "silhouette", so the foot line stops moving and a jump measures as
 * nothing. It also inflates the canvas.
 *
 * A character is one connected mass. Anything not joined to it is not the
 * character, so the largest connected region wins and the rest goes back to
 * background. How much was dropped is returned rather than discarded: a large
 * detached region is a drawn artefact, which is a fact about the frame.
 */
export function keepLargestBody(
  mask: Foreground,
  width: number,
  height: number,
): { foreground: Foreground; detached: number } {
  const { label, sizes } = labelBodies(mask, width, height);
  if (sizes.length <= 1) return { foreground: mask, detached: 0 };
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i;
  const total = sizes.reduce((sum, size) => sum + size, 0);

  const foreground = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) foreground[i] = label[i] === best ? 1 : 0;
  return { foreground, detached: total > 0 ? (total - sizes[best]!) / total : 0 };
}

export interface LabelledBodies {
  /** One id per pixel, -1 where there is no foreground. */
  label: Int32Array;
  /** Pixel count per id. */
  sizes: number[];
}

/**
 * Every connected mass, not only the winner.
 *
 * `keepLargestBody` answers "which of these is the character"; this answers
 * "how many separate things are there and where". A parts sheet — one drawing
 * of a character's head, torso, limbs and gear laid out apart from each other
 * — is exactly a picture whose separate masses are the point.
 */
export function labelBodies(mask: Foreground, width: number, height: number): LabelledBodies {
  const label = new Int32Array(mask.length).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(mask.length);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]! >= 0) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const at = queue[head++] ?? 0;
      size++;
      const x = at % width;
      const y = (at - x) / width;
      const visit = (next: number): void => {
        if (mask[next] && label[next]! < 0) {
          label[next] = id;
          queue[tail++] = next;
        }
      };
      if (x > 0) visit(at - 1);
      if (x < width - 1) visit(at + 1);
      if (y > 0) visit(at - width);
      if (y < height - 1) visit(at + width);
    }
    sizes.push(size);
  }
  return { label, sizes };
}
