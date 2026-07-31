import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { TRANSPARENT, type Rgb } from '../engine/types';
import { decodeIndexedPng, encodeIndexedPng, palettesMatch, scaleCells } from './png';

const palette: Rgb[] = [
  [63, 107, 52],
  [227, 181, 140],
  [35, 26, 18],
];

function sample(width = 5, height = 4): Int16Array {
  const cells = new Int16Array(width * height).fill(TRANSPARENT);
  for (let i = 0; i < width * height; i++) cells[i] = i % 4 === 0 ? TRANSPARENT : i % 3;
  return cells;
}

describe('indexed frames', () => {
  it('round-trips cells and palette exactly', () => {
    const cells = sample();
    const file = encodeIndexedPng(cells, 5, 4, palette);
    const read = decodeIndexedPng(file);

    expect(read.width).toBe(5);
    expect(read.height).toBe(4);
    expect([...read.cells]).toEqual([...cells]);
    expect(read.palette).toEqual(palette);
  });

  it('writes a real indexed PNG, with index 0 transparent', () => {
    // Read back by a library that had nothing to do with writing it: the claim
    // is that this is a PNG anything can open, not that our own reader agrees
    // with our own writer.
    const file = encodeIndexedPng(sample(), 5, 4, palette);
    const decoded = PNG.sync.read(file);

    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(4);
    // pngjs expands to RGBA, which is exactly what tells us `tRNS` is honoured.
    expect(decoded.data[3]).toBe(0); // cell 0 is transparent
    expect([decoded.data[4], decoded.data[5], decoded.data[6], decoded.data[7]]).toEqual([
      ...palette[1]!,
      255,
    ]);
  });

  it('refuses a frame that is not an indexed PNG', () => {
    const truecolour = new PNG({ width: 2, height: 2 });
    truecolour.data.fill(120);
    expect(() => decodeIndexedPng(PNG.sync.write(truecolour))).toThrow(/indexed/);
  });

  it('spots a palette that has been edited elsewhere', () => {
    expect(palettesMatch(palette, [...palette])).toBe(true);
    expect(palettesMatch(palette, [[63, 107, 52], [227, 181, 141], [35, 26, 18]])).toBe(false);
    expect(palettesMatch(palette, palette.slice(0, 2))).toBe(false);
  });

  it('refuses a palette too large for one file', () => {
    const large = Array.from({ length: 256 }, (_, i): Rgb => [i, i, i]);
    expect(() => encodeIndexedPng(sample(), 5, 4, large)).toThrow(/255 colours/);
  });

  it('enlarges without blurring', () => {
    const cells = Int16Array.from([0, 1, TRANSPARENT, 2]);
    const big = scaleCells(cells, 2, 2, 3);
    expect(big.width).toBe(6);
    expect(big.height).toBe(6);
    expect(big.cells[0]).toBe(0);
    expect(big.cells[2]).toBe(0);
    expect(big.cells[3]).toBe(1);
    expect(big.cells[6 * 3 + 0]).toBe(TRANSPARENT);
    expect(big.cells[6 * 3 + 3]).toBe(2);
  });
});
