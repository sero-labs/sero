/**
 * The two primitives that have to be right rather than plausible.
 *
 * A PNG encoder and a hash both fail silently: the file opens in one viewer and
 * not another, or two different projects agree on a checksum. So both are
 * checked against something outside this engine — Node's own zlib for the
 * compressed stream and CRCs, and the published SHA-256 vectors for the hash.
 */

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { sha256Hex, utf8Bytes } from './hash';
import { encodePng } from './png';
import { renderGrid, type RgbaImage } from './render';
import { knightProject } from './testing/fixtures';

/** Split a PNG into its chunks, checking each CRC on the way through. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const found: { type: string; data: Uint8Array }[] = [];
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.slice(at + 4, at + 8));
    const body = png.slice(at + 4, at + 8 + length);
    const crc = view.getUint32(at + 8 + length);
    expect(crc32(body), `CRC of the ${type} chunk`).toBe(crc);
    found.push({ type, data: png.slice(at + 8, at + 8 + length) });
    at += length + 12;
  }
  return found;
}

/** An independent CRC-32, written from the polynomial rather than shared with png.ts. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function image(width: number, height: number): RgbaImage {
  const grid = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (x + y) % 6));
  return renderGrid(grid, knightProject().palette);
}

describe('the PNG a real decoder sees', () => {
  it('has correct chunk CRCs and a zlib stream that inflates to the scanlines', () => {
    const png = encodePng(image(12, 16));
    const parts = chunks(png);
    expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const raw = inflateSync(Buffer.from(parts[1].data));
    expect(raw.length).toBe((12 * 4 + 1) * 16);
    // Every scanline carries filter type 0, so the pixels sit in the stream as written.
    for (let y = 0; y < 16; y += 1) expect(raw[y * (12 * 4 + 1)]).toBe(0);
  });

  it('holds the pixels the renderer produced, byte for byte', () => {
    const source = image(9, 7);
    const raw = inflateSync(Buffer.from(chunks(encodePng(source))[1].data));
    for (let y = 0; y < 7; y += 1) {
      const row = raw.subarray(y * (9 * 4 + 1) + 1, y * (9 * 4 + 1) + 1 + 9 * 4);
      expect([...row]).toEqual([...source.data.subarray(y * 9 * 4, (y + 1) * 9 * 4)]);
    }
  });

  it('splits a stream past one stored block and still inflates', () => {
    // A stored deflate block holds 65535 bytes, so this sheet needs several and
    // gets the block headers wrong if the arithmetic is off by one.
    const source = image(140, 140);
    expect(source.data.length).toBeGreaterThan(65_535);
    const raw = inflateSync(Buffer.from(chunks(encodePng(source))[1].data));
    expect(raw.length).toBe((140 * 4 + 1) * 140);
  });

  it('refuses an image that is not an image', () => {
    expect(() => encodePng({ width: 0, height: 0, data: new Uint8Array(0) })).toThrow(/at least one pixel/);
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8Array(4) })).toThrow(/bytes of RGBA/);
  });
});

describe('SHA-256', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(utf8Bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(utf8Bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('agrees with Node for inputs that straddle a block boundary', () => {
    for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = new Uint8Array(length).map((_, index) => (index * 37) % 256);
      expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('encodes text as UTF-8, including characters outside the basic plane', () => {
    for (const text of ['', 'abc', 'né', '→', '🎨', 'Sero — pixel engine']) {
      expect([...utf8Bytes(text)]).toEqual([...Buffer.from(text, 'utf8')]);
    }
  });
});
