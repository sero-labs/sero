import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { toHex } from '../engine/colour';
import { testCharacter } from '../engine/testing/synth';
import { TRANSPARENT, type Rgb } from '../engine/types';
import type { CharacterRecord } from '../shared/character';
import { applyPaletteCap, defaultRamps, ingestCharacter, remeasure } from './ingest';
import { decodeIndexedPng, palettesMatch } from './png';
import { paletteOf } from './store';

/**
 * What ingestion claims, tested against material whose answer is known.
 *
 * The picture is built here at eight times its art size, the way the reference
 * the user supplied was, so "recovered at its true size" is a claim with a
 * number behind it rather than a description of what the code happens to do.
 */

const SCALE = 8;
const MARGIN = 24;
const BACKGROUND: Rgb = [255, 255, 255];

/**
 * Ten colours far enough apart that recovery cannot merge two of them, so the
 * measured palette has a knowable size.
 */
const SEPARATED: readonly Rgb[] = [
  [200, 40, 40],
  [40, 200, 40],
  [40, 40, 200],
  [200, 200, 40],
  [180, 60, 170],
  [40, 200, 200],
  [120, 60, 20],
  [20, 20, 20],
  [140, 140, 140],
  [230, 150, 90],
];

interface Sprite {
  cols: number;
  rows: number;
  cells: Int16Array;
  palette: readonly Rgb[];
}

/**
 * The synth character with its ramps pulled apart.
 *
 * The shape is what is borrowed: a hanging blade, and single-pixel detail at
 * odd art coordinates, which is what anchors the grid answer to 8 rather than
 * to 16. The palette is replaced because recovery merges colours closer than 24
 * apart, so a ramp of near-identical shades has no knowable measured size.
 */
function separated(): Sprite {
  const character = testCharacter();
  return { cols: character.cols, rows: character.rows, cells: character.cells, palette: SEPARATED };
}

/**
 * The same character with the whites of its eyes: a hole the colour of the
 * background, touching no edge of the picture.
 */
function withEyeWhites(): Sprite {
  const character = separated();
  const cells = Int16Array.from(character.cells);
  for (const x of [10, 13]) for (const y of [6, 7]) cells[y * character.cols + x] = 10;
  return { ...character, cells, palette: [...SEPARATED, BACKGROUND] };
}

/** The sprite drawn eight times life size on a flat background, as a PNG. */
function picture(sprite: Sprite, scale = SCALE): Buffer {
  const png = new PNG({
    width: sprite.cols * scale + MARGIN * 2,
    height: sprite.rows * scale + MARGIN * 2,
  });
  for (let i = 0; i < png.width * png.height; i++) {
    png.data[i * 4] = BACKGROUND[0];
    png.data[i * 4 + 1] = BACKGROUND[1];
    png.data[i * 4 + 2] = BACKGROUND[2];
    png.data[i * 4 + 3] = 255;
  }
  for (let y = 0; y < sprite.rows * scale; y++)
    for (let x = 0; x < sprite.cols * scale; x++) {
      const index = sprite.cells[Math.floor(y / scale) * sprite.cols + Math.floor(x / scale)] ?? TRANSPARENT;
      const colour = index < 0 ? undefined : sprite.palette[index];
      if (colour === undefined) continue;
      const at = ((y + MARGIN) * png.width + x + MARGIN) * 4;
      png.data[at] = colour[0];
      png.data[at + 1] = colour[1];
      png.data[at + 2] = colour[2];
    }
  return PNG.sync.write(png);
}

/** Where the character sits inside its own grid, in art pixels. */
function bodyBox(sprite: Sprite): { minX: number; minY: number; cols: number; rows: number } {
  let minX = sprite.cols;
  let minY = sprite.rows;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sprite.rows; y++)
    for (let x = 0; x < sprite.cols; x++)
      if ((sprite.cells[y * sprite.cols + x] ?? TRANSPARENT) >= 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  return { minX, minY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-ingest-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function ingest(sprite: Sprite, id = 'chr-1'): Promise<CharacterRecord> {
  return ingestCharacter(paths, {
    characterId: id,
    name: 'Knight',
    source: 'reference',
    bytes: picture(sprite),
    fileName: 'knight.png',
  });
}

function basePose(record: CharacterRecord): Promise<Buffer> {
  return readFile(path.join(home, record.basePoseFile));
}

describe('ingesting a picture', () => {
  it('recovers the artwork at its true size, with the palette it was drawn in', async () => {
    const sprite = separated();
    const box = bodyBox(sprite);
    const record = await ingest(sprite);

    expect(record.ingestion.block).toBe(SCALE);
    // Edges land on the grid far more often than chance allows; the reference
    // gave a clear answer the same way.
    expect(record.ingestion.lift).toBeGreaterThan(6);
    expect(record.artWidth).toBe(box.cols);
    expect(record.artHeight).toBe(box.rows);
    expect(record.palette).toHaveLength(SEPARATED.length);
    expect(record.ingestion.measuredColours).toBe(SEPARATED.length);
    expect(record.ingestion.sourceWidth).toBe(sprite.cols * SCALE + MARGIN * 2);
    // Nothing is generated until the user approves what they can see (D5).
    expect(record.status).toBe('draft');

    // The character holds a blade that hangs below his boots, and a blade tip
    // is not what anybody stands on: the foot line is the lowest row carrying
    // real width, which leaves the blade's own row below it (D35).
    expect(record.root.footRow).toBe(box.rows - 1);

    // Every cell, not a sample: the silhouette and the colour both survived.
    const stored = decodeIndexedPng(await basePose(record));
    expect(stored.width).toBe(box.cols);
    expect(stored.height).toBe(box.rows);
    for (let row = 0; row < box.rows; row++)
      for (let col = 0; col < box.cols; col++) {
        const drawn = sprite.cells[(row + box.minY) * sprite.cols + col + box.minX] ?? TRANSPARENT;
        const cell = stored.cells[row * box.cols + col] ?? TRANSPARENT;
        const wanted = drawn < 0 ? null : sprite.palette[drawn] ?? null;
        const got = cell < 0 ? null : stored.palette[cell] ?? null;
        expect({ col, row, colour: got }).toEqual({ col, row, colour: wanted });
      }
  });

  it('writes the base pose as a real indexed PNG carrying the character palette', async () => {
    const record = await ingest(separated());
    const bytes = await basePose(record);

    // Our own reader refuses anything that is not 8-bit indexed, so getting a
    // result out of it is the format claim (D2)...
    expect(palettesMatch(decodeIndexedPng(bytes).palette, paletteOf(record))).toBe(true);

    // ...and a library that had nothing to do with writing it agrees. `pngjs`
    // reports the file's own palette, and a truecolour file has none, so this
    // is its verdict on whether the file is really indexed.
    const outside = PNG.sync.read(bytes);
    expect(Boolean(outside.palette)).toBe(true);
    expect(outside.width).toBe(record.artWidth);
    const cells = decodeIndexedPng(bytes).cells;
    const drawn = [...cells].findIndex((cell) => cell >= 0);
    const blank = [...cells].findIndex((cell) => cell < 0);
    expect(outside.data[blank * 4 + 3]).toBe(0);
    expect([...outside.data.subarray(drawn * 4, drawn * 4 + 4)]).toEqual([
      ...(paletteOf(record)[cells[drawn] ?? 0] ?? []),
      255,
    ]);
  });

  it('cuts the background without eating the whites of the eyes', async () => {
    const sprite = withEyeWhites();
    const box = bodyBox(sprite);
    const record = await ingest(sprite);
    const stored = decodeIndexedPng(await basePose(record));

    expect(record.ingestion.backgroundRemoved).toBe(true);
    // The corner of the recovered box is beside the character, not on it.
    expect(stored.cells[0]).toBe(TRANSPARENT);

    // The hole the character encloses is background-coloured and is still
    // there: a colour test would have eaten it, a flood fill cannot reach it.
    const eye = (6 - box.minY) * box.cols + (10 - box.minX);
    expect(stored.cells[eye]).toBeGreaterThanOrEqual(0);
    expect(stored.palette[stored.cells[eye] ?? 0]).toEqual(BACKGROUND);
    expect(record.palette.filter((hex) => hex === toHex(BACKGROUND))).toHaveLength(1);
  });

  it('refuses a picture that is not a PNG', async () => {
    await expect(
      ingestCharacter(paths, {
        characterId: 'chr-jpeg',
        name: 'Knight',
        source: 'reference',
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]),
        fileName: 'knight.jpg',
      }),
    ).rejects.toThrow(/knight\.jpg must be a PNG/);
  });
});

describe('capping the palette', () => {
  it('re-quantises the character, and says what the art direction cost', async () => {
    const measured = await ingest(separated());
    expect(measured.ingestion.residual).toBe(0);
    const before = await basePose(measured);

    const capped = await applyPaletteCap(paths, measured.id, { kind: 'count', count: 8 });
    expect(capped?.palette).toHaveLength(8);
    expect(capped?.cap).toEqual({ kind: 'count', count: 8 });
    expect(capped?.ingestion.measuredColours).toBe(SEPARATED.length);
    expect(capped?.ingestion.residual).toBeGreaterThan(0);

    // The result is visible before approval, so the file on disk moved with the
    // record and still carries the palette the record claims (D17).
    const after = await basePose(capped!);
    expect(after.equals(before)).toBe(false);
    const stored = decodeIndexedPng(after);
    expect(palettesMatch(stored.palette, paletteOf(capped!))).toBe(true);
    expect(Math.max(...stored.cells)).toBeLessThan(8);

    // Capping harder costs more, and the number the user is shown says so.
    const harder = await applyPaletteCap(paths, measured.id, { kind: 'count', count: 4 });
    expect(harder?.palette).toHaveLength(4);
    expect(harder?.ingestion.residual).toBeGreaterThan(capped?.ingestion.residual ?? 0);
  });

  it('gives the measured palette back, because the cap starts from the picture', async () => {
    const measured = await ingest(separated());
    await applyPaletteCap(paths, measured.id, { kind: 'count', count: 4 });
    const restored = await applyPaletteCap(paths, measured.id, { kind: 'measured' });

    expect(restored?.palette).toEqual(measured.palette);
    expect(restored?.ingestion.residual).toBe(0);
    expect((await basePose(restored!)).equals(await basePose(measured))).toBe(true);
  });

  it('puts a character with no record aside rather than failing', async () => {
    expect(await applyPaletteCap(paths, 'chr-missing', { kind: 'measured' })).toBeNull();
    expect(await remeasure(paths, 'chr-missing')).toBeNull();
  });
});

describe('re-measuring', () => {
  it('produces the same measurements from the kept picture', async () => {
    const first = await ingest(separated());
    const again = await remeasure(paths, first.id);

    expect(again?.ingestion).toEqual(first.ingestion);
    expect(again?.palette).toEqual(first.palette);
    expect(again?.root).toEqual(first.root);
    expect(again?.artWidth).toBe(first.artWidth);
    expect(again?.artHeight).toBe(first.artHeight);
    expect((await basePose(again!)).equals(await basePose(first))).toBe(true);
  });

  it('keeps the cap, so a re-measure does not undo the art direction', async () => {
    const measured = await ingest(separated());
    await applyPaletteCap(paths, measured.id, { kind: 'count', count: 8 });
    const again = await remeasure(paths, measured.id);

    expect(again?.cap).toEqual({ kind: 'count', count: 8 });
    expect(again?.palette).toHaveLength(8);
  });
});

describe('ramps', () => {
  it('names each group after the colours in it, darkest member first', () => {
    expect(
      defaultRamps([
        [63, 107, 52], // shirt
        [70, 114, 59], // shirt, one shade up
        [138, 90, 52], // leather
        [90, 60, 35], // leather, in shadow
        [50, 90, 220], // cloak
        [128, 128, 128], // stone
      ]),
    ).toEqual([
      { name: 'greens', indexes: [0, 1] },
      // Brown has no hue of its own: these two are dark oranges.
      { name: 'browns', indexes: [3, 2] },
      { name: 'blues', indexes: [4] },
      { name: 'neutrals', indexes: [5] },
    ]);
    // The same hue, lighter, is what a person would call orange.
    expect(defaultRamps([[240, 140, 30]])[0]?.name).toBe('oranges');
  });

  it('tells two ramps of the same family apart', async () => {
    const record = await ingest(separated());
    const names = record.ramps.map((ramp) => ramp.name);
    expect(new Set(names).size).toBe(names.length);
    // Every entry belongs to exactly one ramp, or the fidelity check has holes.
    expect(record.ramps.flatMap((ramp) => ramp.indexes).toSorted((a, b) => a - b)).toEqual(
      record.palette.map((_, index) => index),
    );
  });
});
