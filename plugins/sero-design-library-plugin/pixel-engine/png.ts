/**
 * RGBA to PNG bytes, with no dependency and no compressor (spec §9, §16).
 *
 * The engine promises byte-identical output for the same project and version.
 * A platform zlib cannot keep that promise: the same pixels compressed by two
 * Node versions, or by Node and a browser, differ in bytes while decoding to the
 * same image — and a checksum that changes when nothing changed is worse than no
 * checksum. So the deflate stream here is *stored*: valid deflate, no
 * compression, one code path everywhere, identical for ever.
 *
 * The cost is file size, and it is affordable where it lands. Sprites are small
 * and are exported at 1× — a 512×64 sheet is about 130 KB — and every consumer
 * of these files (Godot, Unity, Phaser, LÖVE, a browser) reads a stored stream
 * exactly like any other PNG. If a compiled sheet ever needs to be smaller, the
 * fix is a real deflate written here, not a platform one.
 */

import type { RgbaImage } from './render';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The largest a stored deflate block may be. */
const BLOCK_SIZE = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((length, part) => length + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function uint32BE(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([new Uint8Array([...type].map((char) => char.charCodeAt(0))), data]);
  return concat([uint32BE(data.length), body, uint32BE(crc32(body))]);
}

/** A zlib stream of stored blocks: the same bytes on every platform, for ever. */
function storedZlib(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let at = 0; at < raw.length || at === 0; at += BLOCK_SIZE) {
    const size = Math.min(BLOCK_SIZE, raw.length - at);
    const last = at + size >= raw.length ? 1 : 0;
    parts.push(new Uint8Array([last, size & 0xff, (size >> 8) & 0xff, ~size & 0xff, (~size >> 8) & 0xff]));
    parts.push(raw.subarray(at, at + size));
  }
  parts.push(uint32BE(adler32(raw)));
  return concat(parts);
}

export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`a PNG is at least one pixel on each side, not ${width}×${height}`);
  }
  if (data.length !== width * height * 4) {
    throw new Error(`a ${width}×${height} image holds ${width * height * 4} bytes of RGBA, not ${data.length}`);
  }
  // Filter type 0 on every scanline: the filters exist to help a compressor, and
  // there is no compressor here to help.
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const from = y * width * 4;
    raw[y * (width * 4 + 1)] = 0;
    raw.set(data.subarray(from, from + width * 4), y * (width * 4 + 1) + 1);
  }

  const header = concat([
    uint32BE(width),
    uint32BE(height),
    // 8 bits per channel, colour type 6 (truecolour with alpha), no interlace.
    new Uint8Array([8, 6, 0, 0, 0]),
  ]);

  return concat([
    new Uint8Array(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', storedZlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
