import { describe, expect, it } from 'vitest';

import { paletteLabel, parsePalette } from './palette-file';

/**
 * A palette the user supplies (D17).
 *
 * Order is asserted because entry order is the palette's identity, and
 * duplicates are dropped because a palette with the same colour twice would
 * give the quantiser two answers to the same question.
 */

describe('reading a palette file', () => {
  it('takes the colours in the order they were written', () => {
    expect(parsePalette('#3f6b34\n#2c4d26\n#8a5a34')).toEqual(['#3f6b34', '#2c4d26', '#8a5a34']);
  });

  it('does not mind how they were written', () => {
    expect(parsePalette('3F6B34, 2c4d26')).toEqual(['#3f6b34', '#2c4d26']);
  });

  it('reads a GIMP palette past its header', () => {
    const gpl = 'GIMP Palette\nName: NES\n#\n#3f6b34 dark green\n#2c4d26 darker green\n';
    expect(parsePalette(gpl)).toEqual(['#3f6b34', '#2c4d26']);
  });

  it('keeps one entry per colour', () => {
    expect(parsePalette('#3f6b34\n#3F6B34')).toEqual(['#3f6b34']);
  });

  it('finds nothing in a file that holds no colours', () => {
    expect(parsePalette('these are only words')).toEqual([]);
    expect(parsePalette('')).toEqual([]);
  });
});

describe('naming a loaded set', () => {
  it('uses the file name, so the chip says what it is', () => {
    expect(paletteLabel('NES.hex')).toBe('NES');
    expect(paletteLabel('  my palette.gpl ')).toBe('my palette');
    expect(paletteLabel('.hex')).toBe('Loaded');
  });
});
