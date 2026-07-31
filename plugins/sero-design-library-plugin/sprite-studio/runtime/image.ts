/**
 * Reading a picture we did not write, and looking at one we did.
 *
 * `png.ts` is deliberately narrow: it reads the frames this plugin wrote and
 * refuses everything else. This is the other side of that boundary. An uploaded
 * reference, a plate an image model drew and a still the page pulled out of a
 * clip all arrive with real variety in them — interlacing, bit depths, foreign
 * colour types — and that is a job for a mature decoder rather than for a
 * hand-written one, so it goes to `pngjs`.
 *
 * **PNG only, and that is a constraint rather than a gap.** `pngjs` decodes no
 * other format, and the page already converts what the user drops through a
 * canvas on the way in. A JPEG reaching here therefore means the conversion was
 * skipped, which is worth saying out loud instead of papering over.
 */

import { PNG } from 'pngjs';

import type { CellGrid, Palette, SourceImage } from '../engine/types';
import { TRANSPARENT } from '../engine/types';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function isPng(bytes: Buffer): boolean {
  return bytes.byteLength >= 8 && bytes.subarray(0, 8).equals(SIGNATURE);
}

/**
 * A picture as the engine wants it: 8-bit RGBA, straight alpha.
 *
 * `name` is only ever used to say which file was wrong, so the message names
 * the picture the user chose rather than a path they have never seen.
 */
export function toSourceImage(bytes: Buffer, name = 'That picture'): SourceImage {
  if (!isPng(bytes)) {
    throw new Error(`${name} must be a PNG. Sprite Studio reads no other format.`);
  }
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: png.data };
}

/**
 * A grid of palette indexes back as pixels, for anything that has to look at a
 * sprite rather than address it — measuring a silhouette, drawing a plate.
 *
 * Transparent cells are written as transparent magenta rather than transparent
 * black, which keeps this agreeing with the file format: `encodeIndexedPng`
 * puts magenta in the transparent palette slot for the same reason, and a
 * consumer that reads colour and ignores alpha then sees the key colour instead
 * of a plausible silhouette.
 */
export function cellsToImage(grid: CellGrid, palette: Palette): SourceImage {
  const data = new Uint8Array(grid.cols * grid.rows * 4);
  for (let i = 0; i < grid.cols * grid.rows; i++) {
    const index = grid.cells[i] ?? TRANSPARENT;
    const colour = index < 0 ? undefined : palette[index];
    data[i * 4] = colour?.[0] ?? 255;
    data[i * 4 + 1] = colour?.[1] ?? 0;
    data[i * 4 + 2] = colour?.[2] ?? 255;
    data[i * 4 + 3] = colour === undefined ? 0 : 255;
  }
  return { width: grid.cols, height: grid.rows, data };
}
