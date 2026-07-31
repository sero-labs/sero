/**
 * Indexed PNG: the storage form (D2).
 *
 * A frame is stored with **one palette index per pixel** and the palette in the
 * `PLTE` chunk. It is not stored as RGBA, because RGBA can represent a colour
 * that is not in the palette, which is the single thing this pipeline exists to
 * prevent — the storage format has to make an illegal frame unrepresentable
 * rather than merely detectable.
 *
 * Two conventions are fixed here so nothing downstream has to ask:
 *
 *  - **Index 0 is always transparent**, declared through `tRNS`, in every frame
 *    of every character. The engine's cells use -1 for transparent and 0-based
 *    palette indexes; the file adds one to each, so a palette of 66 colours
 *    occupies file entries 1 to 66. A palette may therefore hold 255 entries.
 *  - **A file's `PLTE` is checked against the character's palette entry by
 *    entry** when it is read, so a frame edited elsewhere is rejected rather
 *    than trusted.
 *
 * Written by hand rather than taken from a library, and the reason is worth
 * recording: no maintained JavaScript encoder writes an indexed PNG with a
 * *caller-supplied* palette. The ones that produce colour type 3 (`upng`,
 * `sharp`) derive the palette themselves by quantising, which would silently
 * reorder or merge the entries the character is defined by. Reading arbitrary
 * user images is a different problem with real variety in it — interlacing, bit
 * depths, foreign colour types — and that goes to `pngjs`, in `image.ts`.
 */

import { deflateSync, inflateSync } from 'node:zlib';

import type { Palette, Rgb } from '../engine/types';
import { TRANSPARENT } from '../engine/types';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** Index 0 is transparent, so this many colours fit in one file. */
export const MAX_PALETTE = 255;

export interface IndexedImage {
  width: number;
  height: number;
  /** Engine cells: `TRANSPARENT` or a 0-based palette index. */
  cells: Int16Array;
  palette: Rgb[];
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export interface EncodeOptions {
  /**
   * Whether index 0 is declared transparent.
   *
   * True for everything stored. False for the plate handed to a video model: a
   * model given a transparent PNG composites it against whatever it likes, and
   * the whole keying strategy rests on the background being flat magenta and
   * nothing else (D7). Entry 0 is magenta either way, so this switch alone is
   * the difference between a stored frame and a plate.
   */
  transparent?: boolean;
}

export function encodeIndexedPng(
  cells: Int16Array,
  width: number,
  height: number,
  palette: Palette,
  options: EncodeOptions = {},
): Buffer {
  if (palette.length > MAX_PALETTE) {
    throw new Error(`A palette may hold ${MAX_PALETTE} colours; this one has ${palette.length}.`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: indexed
  // Compression 0, filter 0, interlace 0 — the rest of the header is zero.

  const plte = Buffer.alloc((palette.length + 1) * 3);
  // Entry 0 is the transparent one. Magenta rather than black, so a viewer that
  // ignores `tRNS` shows something obviously wrong instead of a plausible
  // silhouette.
  plte[0] = 255;
  plte[1] = 0;
  plte[2] = 255;
  for (const [index, colour] of palette.entries()) {
    plte[(index + 1) * 3] = colour[0];
    plte[(index + 1) * 3 + 1] = colour[1];
    plte[(index + 1) * 3 + 2] = colour[2];
  }

  // A sprite pixel is in or out: index 0 is fully transparent and every other
  // entry is fully opaque. There is no partial alpha anywhere in the format.
  const trns = Buffer.from([0]);

  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const cell = cells[y * width + x] ?? TRANSPARENT;
      raw[y * (width + 1) + 1 + x] = cell < 0 ? 0 : cell + 1;
    }
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(options.transparent === false ? [] : [chunk('tRNS', trns)]),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface Chunks {
  ihdr: Buffer | null;
  plte: Buffer | null;
  idat: Buffer[];
}

function readChunks(buffer: Buffer): Chunks {
  const chunks: Chunks = { ihdr: null, plte: null, idat: [] };
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') chunks.ihdr = data;
    else if (type === 'PLTE') chunks.plte = data;
    else if (type === 'IDAT') chunks.idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  return chunks;
}

/**
 * Read a frame this plugin wrote.
 *
 * Deliberately narrow: 8-bit, indexed, not interlaced, which is exactly what
 * `encodeIndexedPng` produces. Anything else is a file we did not write, and the
 * honest answer for one of those is to refuse rather than to guess.
 */
export function decodeIndexedPng(buffer: Buffer): IndexedImage {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('That is not a PNG.');
  const { ihdr, plte, idat } = readChunks(buffer);
  if (ihdr === null) throw new Error('The PNG has no header.');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colourType = ihdr[9];
  const interlace = ihdr[12];
  if (colourType !== 3 || depth !== 8) {
    throw new Error(`A sprite frame must be an 8-bit indexed PNG; this one is colour type ${colourType} at ${depth} bits.`);
  }
  if (interlace !== 0) throw new Error('An interlaced sprite frame is not a file this wrote.');
  if (plte === null) throw new Error('The PNG has no palette.');

  const raw = inflateSync(Buffer.concat(idat));
  const cells = new Int16Array(width * height).fill(TRANSPARENT);
  const line = new Uint8Array(width);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    for (let x = 0; x < width; x++) {
      const value = raw[position + x] ?? 0;
      // Only `none` and `sub` can appear in a file this wrote, but a decoder
      // that silently produced garbage for the others would be worse than one
      // that handles them: they are cheap, and this is the only reader.
      const left = x > 0 ? line[x - 1] ?? 0 : 0;
      const up = y > 0 ? (cells[(y - 1) * width + x] ?? TRANSPARENT) + 1 : 0;
      const upLeft = y > 0 && x > 0 ? (cells[(y - 1) * width + x - 1] ?? TRANSPARENT) + 1 : 0;
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
      byte &= 0xff;
      line[x] = byte;
      cells[y * width + x] = byte === 0 ? TRANSPARENT : byte - 1;
    }
    position += width;
  }

  const palette: Rgb[] = [];
  // Entry 0 is the transparent slot and is not part of the character's palette.
  const entries = Math.floor(plte.length / 3);
  for (let i = 1; i < entries; i++) {
    palette.push([plte[i * 3] ?? 0, plte[i * 3 + 1] ?? 0, plte[i * 3 + 2] ?? 0]);
  }

  return { width, height, cells, palette };
}

/**
 * The check that makes the format's promise hold: a frame whose palette has
 * been edited elsewhere is rejected rather than trusted.
 */
export function palettesMatch(a: Palette, b: Palette): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return other !== undefined && entry[0] === other[0] && entry[1] === other[1] && entry[2] === other[2];
  });
}

/** Nearest-neighbour enlargement, for looking at a sprite without blurring it. */
export function scaleCells(
  cells: Int16Array,
  width: number,
  height: number,
  factor: number,
): { cells: Int16Array; width: number; height: number } {
  const out = new Int16Array(width * factor * height * factor).fill(TRANSPARENT);
  for (let y = 0; y < height * factor; y++)
    for (let x = 0; x < width * factor; x++) {
      out[y * width * factor + x] =
        cells[Math.floor(y / factor) * width + Math.floor(x / factor)] ?? TRANSPARENT;
    }
  return { cells: out, width: width * factor, height: height * factor };
}
