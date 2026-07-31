import { describe, expect, it } from 'vitest';

import {
  blankGrid,
  boundingBox,
  charToIndex,
  cloneGrid,
  countFilled,
  decodeGrid,
  encodeGrid,
  flipGridX,
  gridEquals,
  GRID_ALPHABET,
  indexToChar,
  MAX_PALETTE_SIZE,
} from './grid';

describe('the rows-of-characters codec', () => {
  it('round-trips every palette index', () => {
    const grid = [Array.from({ length: MAX_PALETTE_SIZE }, (_, index) => index)];
    const rows = encodeGrid(grid);
    expect(rows).toEqual([GRID_ALPHABET]);
    expect(decodeGrid(rows, MAX_PALETTE_SIZE, 1, MAX_PALETTE_SIZE)).toEqual({ grid, faults: [] });
  });

  it('round-trips a grid of any shape', () => {
    const grid = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [0, 0, 31, 0],
    ];
    const decoded = decodeGrid(encodeGrid(grid), 4, 3, 32);
    expect(decoded.faults).toEqual([]);
    expect(gridEquals(decoded.grid, grid)).toBe(true);
  });

  it('addresses exactly 32 indexes, one character each', () => {
    expect(MAX_PALETTE_SIZE).toBe(32);
    expect(new Set(GRID_ALPHABET).size).toBe(32);
    expect(indexToChar(0)).toBe('0');
    expect(indexToChar(31)).toBe('v');
    expect(() => indexToChar(32)).toThrow();
    expect(charToIndex('V')).toBe(31);
    expect(charToIndex('!')).toBe(-1);
  });
});

describe('decoding reports rather than throwing', () => {
  it('returns a full canvas even when the text is wrong', () => {
    const { grid, faults } = decodeGrid(['01', '0'], 2, 3, 2);
    expect(grid).toEqual([
      [0, 1],
      [0, 0],
      [0, 0],
    ]);
    expect(faults.map((fault) => fault.code)).toEqual(['row-count', 'row-length']);
  });

  it('names the cell for a character outside the palette', () => {
    const { faults } = decodeGrid(['05'], 2, 1, 3);
    expect(faults).toHaveLength(1);
    expect(faults[0].code).toBe('index-outside-palette');
    expect(faults[0].where).toEqual({ x: 1, y: 0, index: 5 });
    expect(faults[0].message).toContain('the palette holds 3 colours');
  });

  it('names the cell for a character that is not a palette character', () => {
    const { faults } = decodeGrid(['0?'], 2, 1, 3);
    expect(faults[0].code).toBe('bad-character');
    expect(faults[0].where).toEqual({ x: 1, y: 0 });
  });

  it('ignores rows past the canvas height rather than growing the grid', () => {
    const { grid } = decodeGrid(['1', '1', '1'], 1, 2, 2);
    expect(grid).toHaveLength(2);
  });
});

describe('grid helpers', () => {
  const grid = [
    [0, 0, 0, 0],
    [0, 1, 2, 0],
    [0, 0, 3, 0],
  ];

  it('measures the box around the artwork', () => {
    expect(boundingBox(grid)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(boundingBox(blankGrid(4, 4))).toBeNull();
  });

  it('counts what is drawn', () => {
    expect(countFilled(grid)).toBe(3);
    expect(countFilled(blankGrid(4, 4))).toBe(0);
  });

  it('mirrors about the grid centre', () => {
    expect(flipGridX(grid)[1]).toEqual([0, 2, 1, 0]);
    expect(gridEquals(flipGridX(flipGridX(grid)), grid)).toBe(true);
  });

  it('clones without sharing rows', () => {
    const copy = cloneGrid(grid);
    copy[1][1] = 9;
    expect(grid[1][1]).toBe(1);
  });
});
