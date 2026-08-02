/**
 * Generate the README's pictures: an animated GIF per clip, plus a still.
 *
 * DEV ONLY. Nothing here is part of the library — the engine stays free of
 * encoders, Node and the DOM. Run it with `example/media.sh` after a
 * deliberate visual change, and commit what it writes.
 *
 * GIF because a GitHub README renders one and cannot run a script, and because
 * the frames are already palette-indexed, which is exactly what the format
 * wants. The encoder below is the minimum GIF89a that browsers accept: a global
 * colour table, the Netscape loop extension, and one LZW-compressed image per
 * frame.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import type { Img } from '../src/index';
import { bakeAllClips, bakeRest } from '../src/index';
import * as knight from './knight';
import * as scout from './scout';
import * as rivet from './rivet';
import * as husk from './husk';

/** Where to write, handed over by `media.sh` — the bundle has no path of its
 * own to work from. */
const MEDIA = process.argv[2] ?? 'media';
/** The page's own backdrop, so a README picture matches the demo. */
const BACKDROP: [number, number, number] = [0x24, 0x1d, 0x42];

// --- indexing ---------------------------------------------------------------

interface Indexed {
  width: number;
  height: number;
  /** One palette index per pixel. */
  pixels: Uint8Array;
  palette: [number, number, number][];
}

/** Flatten frames onto the backdrop and index them against one shared palette,
 * which is what a GIF's global colour table is. */
function index(frames: readonly Img[], scale: number): Indexed[] {
  const palette: [number, number, number][] = [BACKDROP];
  const at = new Map<number, number>([[key(BACKDROP), 0]]);
  return frames.map((img) => {
    const width = img.w * scale;
    const height = img.h * scale;
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = Math.floor(x / scale);
        const sy = Math.floor(y / scale);
        let rgb = BACKDROP;
        if (img.alpha(sx, sy) >= 0.5) {
          const c = img.get(sx, sy);
          rgb = [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
        }
        const k = key(rgb);
        let i = at.get(k);
        if (i === undefined) {
          if (palette.length >= 256) throw new Error('more than 256 colours in a clip');
          i = palette.length;
          palette.push(rgb);
          at.set(k, i);
        }
        pixels[y * width + x] = i;
      }
    }
    return { width, height, pixels, palette };
  });
}

const key = (c: readonly number[]): number => (c[0] << 16) | (c[1] << 8) | c[2];

// --- GIF --------------------------------------------------------------------

class Bytes {
  private out: number[] = [];
  byte(v: number): void {
    this.out.push(v & 0xff);
  }
  short(v: number): void {
    this.out.push(v & 0xff, (v >> 8) & 0xff);
  }
  string(s: string): void {
    for (const ch of s) this.out.push(ch.charCodeAt(0));
  }
  raw(values: readonly number[]): void {
    for (const v of values) this.out.push(v & 0xff);
  }
  buffer(): Buffer {
    return Buffer.from(this.out);
  }
}

/**
 * GIF's LZW: codes start one bit wider than the pixel depth, the table is
 * reset with a clear code whenever it fills, and the output is a bitstream
 * packed least-significant-bit first into 255-byte sub-blocks.
 */
function lzw(pixels: Uint8Array, depth: number): number[] {
  const clear = 1 << depth;
  const end = clear + 1;
  let size = depth + 1;
  let next = end + 1;
  let table = new Map<string, number>();
  const bits: number[] = [];
  let acc = 0;
  let accBits = 0;
  const emit = (code: number): void => {
    acc |= code << accBits;
    accBits += size;
    while (accBits >= 8) {
      bits.push(acc & 0xff);
      acc >>= 8;
      accBits -= 8;
    }
  };
  const reset = (): void => {
    table = new Map();
    size = depth + 1;
    next = end + 1;
  };

  emit(clear);
  let prefix = String(pixels[0]);
  for (let i = 1; i < pixels.length; i++) {
    const candidate = `${prefix},${pixels[i]}`;
    if (table.has(candidate)) {
      prefix = candidate;
      continue;
    }
    emit(code(prefix, table, clear));
    table.set(candidate, next++);
    if (next > (1 << size) && size < 12) size++;
    else if (next > 4095) {
      emit(clear);
      reset();
    }
    prefix = String(pixels[i]);
  }
  emit(code(prefix, table, clear));
  emit(end);
  if (accBits > 0) bits.push(acc & 0xff);
  return bits;
}

/** A single pixel is its own code; anything longer is in the table. */
function code(prefix: string, table: Map<string, number>, clear: number): number {
  const found = table.get(prefix);
  if (found !== undefined) return found;
  const single = Number(prefix);
  if (!Number.isInteger(single) || single >= clear) {
    throw new Error(`lzw: '${prefix}' is neither a table entry nor a pixel`);
  }
  return single;
}

function encodeGif(frames: Indexed[], delayCs: number): Buffer {
  const first = frames[0];
  const palette = first.palette;
  let depth = 1;
  while (1 << depth < palette.length) depth++;
  const tableSize = 1 << depth;
  const b = new Bytes();

  b.string('GIF89a');
  b.short(first.width);
  b.short(first.height);
  // global table present | 8-bit colour resolution | table size exponent
  b.byte(0x80 | 0x70 | (depth - 1));
  b.byte(0);
  b.byte(0);
  for (let i = 0; i < tableSize; i++) b.raw(palette[i] ?? [0, 0, 0]);

  // Netscape 2.0: loop forever.
  b.raw([0x21, 0xff, 0x0b]);
  b.string('NETSCAPE2.0');
  b.raw([0x03, 0x01]);
  b.short(0);
  b.byte(0);

  for (const frame of frames) {
    b.raw([0x21, 0xf9, 0x04, 0x04]);
    b.short(delayCs);
    b.byte(0);
    b.byte(0);
    b.byte(0x2c);
    b.short(0);
    b.short(0);
    b.short(frame.width);
    b.short(frame.height);
    b.byte(0);
    // LZW depth has a floor of 2; a 2-colour image still codes at 2 bits.
    const lzwDepth = Math.max(2, depth);
    b.byte(lzwDepth);
    const data = lzw(frame.pixels, lzwDepth);
    for (let at = 0; at < data.length; at += 255) {
      const chunk = data.slice(at, at + 255);
      b.byte(chunk.length);
      b.raw(chunk);
    }
    b.byte(0);
  }
  b.byte(0x3b);
  return b.buffer();
}

// --- PNG (stills) -----------------------------------------------------------

function crc32(bytes: Buffer): number {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const tagged = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged), 0);
  return Buffer.concat([head, tagged, crc]);
}

function encodePng(frame: Indexed): Buffer {
  const raw = Buffer.alloc((frame.width + 1) * frame.height);
  for (let y = 0; y < frame.height; y++) {
    raw[y * (frame.width + 1)] = 0;
    for (let x = 0; x < frame.width; x++) {
      raw[y * (frame.width + 1) + 1 + x] = frame.pixels[y * frame.width + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(frame.width, 0);
  ihdr.writeUInt32BE(frame.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.concat(frame.palette.map((c) => Buffer.from(c)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drive ------------------------------------------------------------------

const SCALE = 4;

function write(name: string, frames: readonly Img[], fps: number, still: boolean): void {
  const indexed = index(frames, SCALE);
  if (still) {
    writeFileSync(join(MEDIA, `${name}.png`), encodePng(indexed[0]));
    console.log(`  ${name}.png`);
    return;
  }
  const gif = encodeGif(indexed, Math.max(2, Math.round(100 / fps)));
  writeFileSync(join(MEDIA, `${name}.gif`), gif);
  console.log(`  ${name}.gif  ${frames.length} frames, ${(gif.length / 1024).toFixed(0)} KB`);
}

mkdirSync(MEDIA, { recursive: true });
for (const [id, build, show] of [
  ['scout', () => scout.buildCharacter(), ['run', 'idle', 'jump']],
  ['rivet', () => rivet.buildCharacter(), ['walk', 'idle', 'startle']],
  ['husk', () => husk.buildCharacter(), ['shamble', 'idle', 'lunge']],
  ['vanguard', () => knight.buildCharacter(), ['walk', 'idle', 'slash']],
] as const) {
  const spec = build();
  console.log(id);
  write(`${id}-rest`, [bakeRest(spec)], 1, true);
  const baked = bakeAllClips(spec);
  for (const clip of show) {
    const entry = baked.get(clip);
    if (entry === undefined) throw new Error(`${id} has no clip '${clip}'`);
    write(`${id}-${clip}`, entry.frames, entry.fps, false);
  }
}
