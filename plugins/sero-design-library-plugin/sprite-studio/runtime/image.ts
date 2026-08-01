/**
 * Reading a picture we did not write.
 *
 * `png.ts` is deliberately narrow: it reads the frames this plugin wrote and
 * refuses everything else. This is the other side of that boundary — an
 * uploaded reference, a plate an image model drew, a still the page pulled out
 * of a clip.
 *
 * **Why this is hand-written rather than `pngjs`.** It was `pngjs`, and that
 * stopped the whole Design Library runtime from starting: the package is
 * CommonJS, the plugin runtime is bundled as ESM, and its `require("util")`
 * throws at load. A runtime that fails to load consumes no requests at all, so
 * every button in the plugin went quietly dead — not only Sprite Studio's.
 *
 * The narrower answer is also the better one. **Pictures arrive through the
 * page**, which has real codecs and re-encodes whatever the user chose — PNG,
 * JPEG, WebP — through a canvas on the way in. So what reaches here is always
 * an 8-bit, non-interlaced PNG, and the wild variety this was afraid of never
 * gets past the renderer. The formats below are the ones a canvas and an image
 * model actually produce.
 */

import { inflateSync } from 'node:zlib';

import type { CellGrid, Palette, SourceImage } from '../engine/types';
import { TRANSPARENT } from '../engine/types';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function isPng(bytes: Buffer): boolean {
  return bytes.byteLength >= 8 && bytes.subarray(0, 8).equals(SIGNATURE);
}

interface Header {
  width: number;
  height: number;
  depth: number;
  colourType: number;
  interlace: number;
}

/** Bytes per pixel for a colour type, and whether it carries alpha. */
function channelsFor(colourType: number): number {
  if (colourType === 0) return 1; // greyscale
  if (colourType === 2) return 3; // truecolour
  if (colourType === 3) return 1; // indexed
  if (colourType === 4) return 2; // greyscale + alpha
  if (colourType === 6) return 4; // truecolour + alpha
  return 0;
}

/**
 * Undo the per-row filters.
 *
 * The five filter types are the format's own, and a decoder that handled only
 * the ones we happen to write would produce quiet rubbish for a picture from
 * anywhere else — which is exactly what this file exists to read.
 */
function unfilter(raw: Buffer, header: Header, bytesPerPixel: number, stride: number): Buffer {
  const out = Buffer.alloc(header.height * stride);
  let position = 0;
  for (let y = 0; y < header.height; y++) {
    const filter = raw[position++] ?? 0;
    const line = raw.subarray(position, position + stride);
    position += stride;
    const current = out.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= bytesPerPixel ? current[i - bytesPerPixel] ?? 0 : 0;
      const up = previous ? previous[i] ?? 0 : 0;
      const upLeft = previous && i >= bytesPerPixel ? previous[i - bytesPerPixel] ?? 0 : 0;
      const value = line[i] ?? 0;
      let byte: number;
      if (filter === 0) byte = value;
      else if (filter === 1) byte = value + left;
      else if (filter === 2) byte = value + up;
      else if (filter === 3) byte = value + ((left + up) >> 1);
      else {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        byte = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      current[i] = byte & 0xff;
    }
  }
  return out;
}

interface Chunks {
  header: Header | null;
  palette: Buffer | null;
  transparency: Buffer | null;
  idat: Buffer[];
}

function readChunks(bytes: Buffer): Chunks {
  const chunks: Chunks = { header: null, palette: null, transparency: null, idat: [] };
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      chunks.header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8] ?? 8,
        colourType: data[9] ?? 6,
        interlace: data[12] ?? 0,
      };
    } else if (type === 'PLTE') chunks.palette = data;
    else if (type === 'tRNS') chunks.transparency = data;
    else if (type === 'IDAT') chunks.idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  return chunks;
}

/**
 * A picture as the engine wants it: 8-bit RGBA, straight alpha.
 *
 * `name` is only ever used to say which file was wrong, so a message names the
 * picture the user chose rather than a path they have never seen.
 */
export function toSourceImage(bytes: Buffer, name = 'That picture'): SourceImage {
  if (!isPng(bytes)) {
    throw new Error(
      `${name} is not a PNG. Pictures are converted by the page on the way in, so this one did not go through it.`,
    );
  }
  const { header, palette, transparency, idat } = readChunks(bytes);
  if (header === null) throw new Error(`${name} has no PNG header.`);
  if (header.interlace !== 0) {
    throw new Error(`${name} is interlaced, which Sprite Studio does not read. Save it without interlacing.`);
  }
  const channels = channelsFor(header.colourType);
  if (channels === 0) throw new Error(`${name} uses PNG colour type ${header.colourType}, which is not a picture format.`);
  if (header.depth !== 8 && header.depth !== 16) {
    throw new Error(`${name} is ${header.depth} bits per channel; Sprite Studio reads 8 and 16.`);
  }

  // 16-bit samples are read and the low byte dropped. Nothing downstream works
  // at more than 8 bits, and quantising to a palette makes the difference
  // invisible long before it reaches a pixel.
  const sampleBytes = header.depth === 16 ? 2 : 1;
  const bytesPerPixel = channels * sampleBytes;
  const stride = header.width * bytesPerPixel;
  const raw = unfilter(inflateSync(Buffer.concat(idat)), header, bytesPerPixel, stride);

  const data = new Uint8Array(header.width * header.height * 4);
  for (let i = 0, n = header.width * header.height; i < n; i++) {
    const at = i * bytesPerPixel;
    const sample = (channel: number): number => raw[at + channel * sampleBytes] ?? 0;
    let r: number;
    let g: number;
    let b: number;
    let a = 255;
    if (header.colourType === 3) {
      const index = sample(0);
      r = palette?.[index * 3] ?? 0;
      g = palette?.[index * 3 + 1] ?? 0;
      b = palette?.[index * 3 + 2] ?? 0;
      a = transparency?.[index] ?? 255;
    } else if (header.colourType === 0 || header.colourType === 4) {
      r = sample(0);
      g = r;
      b = r;
      if (header.colourType === 4) a = sample(1);
    } else {
      r = sample(0);
      g = sample(1);
      b = sample(2);
      if (header.colourType === 6) a = sample(3);
    }
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }

  return { width: header.width, height: header.height, data };
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
