/**
 * The rest of the deterministic stage, on material whose answer is known.
 *
 * Where `known-answers.test.ts` puts a whole clip through the pipeline, this
 * checks the individual claims the specification makes: that the grid is found
 * by measurement, that a loop is found by looking at every pair, that thinning
 * keeps the extremes and the real timing, and that the checks **refuse** rather
 * than merely reporting a number.
 */

import { readFileSync } from 'node:fs';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { recoverArtwork } from './art-grid';
import { buildAtlas } from './atlas';
import { checkAnimation, checkContinuity, countOrphans } from './checks';
import { compileAnimation } from './compile';
import { loopAdvice, playOrder, searchLoop } from './loop';
import { capPalette, capResidual, dedupePalette, remapCells } from './palette';
import { buildSheet } from './sheet';
import { extremesOf, thin } from './thin';
import { makeSequence, testCharacter, walkPose, type SynthFrame } from './testing/synth';
import { TRANSPARENT, type CellGrid, type Rgb, type SourceImage } from './types';

const character = testCharacter();
const SCALE = 3;

function grid(cols: number, rows: number, fill: (x: number, y: number) => number): CellGrid {
  const cells = new Int16Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells[y * cols + x] = fill(x, y);
  return { cols, rows, cells };
}

/** The character's drawn extent, which is what recovery returns. */
function drawnBox(sprite: { cols: number; rows: number; cells: Int16Array }) {
  let minX = sprite.cols;
  let minY = sprite.rows;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sprite.rows; y++)
    for (let x = 0; x < sprite.cols; x++)
      if ((sprite.cells[y * sprite.cols + x] ?? TRANSPARENT) >= 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return { cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

function compiled(frames: SynthFrame[], noise = 0) {
  const sequence = makeSequence({
    sprite: character,
    palette: character.palette,
    scale: SCALE,
    frames,
    noise,
  });
  const result = compileAnimation(sequence.plates, { palette: character.palette, scale: SCALE });
  if (result === null) throw new Error('nothing compiled');
  return result;
}

describe('recovering the artwork', () => {
  /** The character drawn at `block`× on flat magenta, as a model returns it. */
  function enlarged(sprite: { cols: number; rows: number; cells: Int16Array }, palette: Rgb[], block: number, canvas = 400): SourceImage {
    const data = new Uint8Array(canvas * canvas * 4);
    for (let i = 0; i < canvas * canvas; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    for (let y = 0; y < sprite.rows * block && y + 30 < canvas; y++)
      for (let x = 0; x < sprite.cols * block && x + 40 < canvas; x++) {
        const index = sprite.cells[Math.floor(y / block) * sprite.cols + Math.floor(x / block)] ?? TRANSPARENT;
        if (index < 0) continue;
        const colour = palette[index]!;
        const at = ((30 + y) * canvas + 40 + x) * 4;
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
        data[at + 3] = 255;
      }
    return { width: canvas, height: canvas, data };
  }

  it('reads the real reference at its true size', () => {
    // The file the whole investigation started from: 62 × 136 artwork, drawn
    // eight times over. Recovery is told neither number.
    const sprite = PNG.sync.read(readFileSync(new URL('./testing/fixtures/reference-sprite.png', import.meta.url)));
    const palette: Rgb[] = [];
    const cells = new Int16Array(sprite.width * sprite.height).fill(TRANSPARENT);
    for (let i = 0; i < sprite.width * sprite.height; i++) {
      if ((sprite.data[i * 4 + 3] ?? 0) < 128) continue;
      const colour: Rgb = [sprite.data[i * 4] ?? 0, sprite.data[i * 4 + 1] ?? 0, sprite.data[i * 4 + 2] ?? 0];
      let index = palette.findIndex((entry) => entry.join() === colour.join());
      if (index < 0) {
        palette.push(colour);
        index = palette.length - 1;
      }
      cells[i] = index;
    }

    const recovered = recoverArtwork(
      enlarged({ cols: sprite.width, rows: sprite.height, cells }, palette, 8, 1200),
      { background: 'magenta' },
    );
    expect(recovered).not.toBeNull();
    expect(recovered!.grid.block).toBe(8);
    expect(recovered!.cols).toBe(sprite.width);
    expect(recovered!.rows).toBe(sprite.height);
  });

  it('says a file already at art size is at art size', () => {
    // Not every picture is enlarged. Reporting a grid of 2 for artwork drawn
    // 1:1 would halve the character and lose every other pixel of it.
    const recovered = recoverArtwork(enlarged(character, character.palette, 1), {
      background: 'magenta',
    });
    expect(recovered!.grid.block).toBe(1);
  });

  it('finds the enlargement by measurement, not by being told', () => {
    // The character drawn at 8× on flat magenta — the reference's own situation.
    const block = 8;
    const canvas = 400;
    const data = new Uint8Array(canvas * canvas * 4);
    for (let i = 0; i < canvas * canvas; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    const originX = 40;
    const originY = 30;
    for (let y = 0; y < character.rows * block; y++)
      for (let x = 0; x < character.cols * block; x++) {
        const index =
          character.cells[Math.floor(y / block) * character.cols + Math.floor(x / block)] ?? TRANSPARENT;
        if (index < 0) continue;
        const colour = character.palette[index]!;
        const at = ((originY + y) * canvas + originX + x) * 4;
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
        data[at + 3] = 255;
      }
    const image: SourceImage = { width: canvas, height: canvas, data };

    const recovered = recoverArtwork(image, { background: 'magenta' });
    expect(recovered).not.toBeNull();
    expect(recovered!.grid.block).toBe(block);
    // Edges landing on the grid far more often than chance is the whole claim.
    expect(recovered!.grid.lift).toBeGreaterThan(1.8);
    // Recovery returns the artwork, so its size is the character's drawn extent
    // rather than the canvas it happened to be drawn on.
    const drawn = drawnBox(character);
    expect(recovered!.cols).toBe(drawn.cols);
    expect(recovered!.rows).toBe(drawn.rows);
    // Fewer entries than the character was drawn with, and that is the stated
    // behaviour: ingestion merges near-identical colours (D8). This character's
    // ramps are a single unit apart per channel, well inside the merge
    // threshold, so each ramp comes back as one colour. The user then caps or
    // edits the palette at the character sheet, before anything is generated.
    expect(recovered!.palette.length).toBeLessThanOrEqual(character.palette.length);
    expect(recovered!.palette.length).toBeGreaterThanOrEqual(5);
  });
});

describe('the loop search', () => {
  it('finds the pair that joins, and calls it forward', () => {
    // A real cycle: the legs scissor through ten poses and come back.
    const cyclic = compiled(
      Array.from({ length: 40 }, (_, i) => ({
        sprite: walkPose((i % 10) / 10),
        dx: Math.round(Math.sin(((i % 10) / 10) * Math.PI * 2) * 3 * SCALE),
      })),
    );
    const search = searchLoop(cyclic.frames.map((frame) => frame.cells));

    expect(search.verdict).toBe('forward');
    expect(search.best).not.toBeNull();
    expect(search.best!.cost).toBeLessThan(0.12);
    // Ten frames of period, so the join lands on a multiple of it.
    expect((search.best!.end - search.best!.start) % 10).toBe(0);
  });

  it('says so honestly when the character never returns to a pose it held', () => {
    // Three walks in five are like this: the legs spread further every frame
    // and no moment is ever held twice. Nothing after the fact can loop it.
    const drifting = compiled(
      Array.from({ length: 14 }, (_, i) => ({ sprite: testCharacter({ crouch: i }) })),
    );
    const search = searchLoop(drifting.frames.map((frame) => frame.cells));

    expect(search.verdict).toBe('none');
    expect(loopAdvice(search)).toMatch(/ping-pong it/);
    expect(loopAdvice(search)).toMatch(/cannot be looped forward/);
  });

  it('plays a ping-pong out and back without repeating either end', () => {
    expect(playOrder(4, 'pingpong')).toEqual([0, 1, 2, 3, 2, 1]);
    expect(playOrder(4, 'forward')).toEqual([0, 1, 2, 3]);
    expect(playOrder(4, 'once')).toEqual([0, 1, 2, 3]);
  });
});

describe('thinning', () => {
  const frames = Array.from({ length: 12 }, (_, i) =>
    // Reach grows to frame 6 and shrinks back: one extreme, in the middle.
    grid(9, 9, (x, y) => (x < 1 + Math.min(i, 12 - i) && y < 3 ? 0 : TRANSPARENT)),
  );
  const durations = frames.map(() => 83);

  it('finds an extreme by measuring, rather than being told where it is', () => {
    const reach = frames.map((frame) => frame.cells.filter((cell) => cell >= 0).length);
    expect(extremesOf(reach)).toContain(6);
  });

  it('keeps the ends and the extremes, and carries the real timing', () => {
    const kept = thin(frames, durations, { anchorCol: 0, anchorRow: 0 });

    expect(kept[0]!.index).toBe(0);
    expect(kept.at(-1)!.index).toBe(11);
    expect(kept.map((frame) => frame.index)).toContain(6);
    // Every millisecond of the source is still accounted for.
    expect(kept.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(83 * 12);
  });

  it('keeps only one end of a loop, because both are the same moment', () => {
    const kept = thin(frames, durations, { anchorCol: 0, anchorRow: 0, looping: true });
    expect(kept.map((frame) => frame.index)).not.toContain(11);
    expect(kept.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(83 * 12);
  });
});

describe('the sheet and the atlas', () => {
  const animation = {
    name: 'walk',
    loop: 'forward' as const,
    playRate: 12,
    anchorCol: 2,
    anchorRow: 5,
    frames: [0, 1, 2].map((i) => ({
      cells: grid(4, 6, (x, y) => (x === i && y > 2 ? 1 : TRANSPARENT)),
      durationMs: 83,
    })),
  };

  it('lays the frames out at a whole-number scale', () => {
    const sheet = buildSheet([animation], { scale: 2 });
    expect(sheet.width).toBe(4 * 2 * 3);
    expect(sheet.height).toBe(6 * 2);
    expect(sheet.frames).toHaveLength(3);
    expect(sheet.frames[1]).toMatchObject({ x: 8, y: 0, width: 8, height: 12 });
    expect(sheet.animations[0]).toMatchObject({ from: 0, to: 2, anchorX: 4, anchorY: 10 });
  });

  it('pads to one cell size for every animation only when asked', () => {
    const tall = {
      ...animation,
      name: 'jump',
      frames: [{ cells: grid(4, 10, () => 0), durationMs: 83 }],
    };
    const natural = buildSheet([animation, tall], {});
    expect(natural.frames[0]!.height).toBe(6);
    expect(natural.frames.at(-1)!.height).toBe(10);

    const uniform = buildSheet([animation, tall], { uniformCell: true });
    expect(uniform.frames.every((frame) => frame.height === 10)).toBe(true);
  });

  it('trims the margin every frame shares, and moves the anchor with it', () => {
    const sheet = buildSheet([animation], { trim: true });
    // Rows 0-2 are empty in every frame, and columns 3 onwards are never drawn.
    expect(sheet.frames[0]!.height).toBe(3);
    expect(sheet.animations[0]!.anchorY).toBe(2);
  });

  it('writes an atlas any engine reading Aseprite can use', () => {
    const sheet = buildSheet([animation], { scale: 1 });
    const atlas = buildAtlas(sheet, {
      image: 'explorer.png',
      characterId: 'explorer',
      artHeight: 136,
      palette: character.palette,
      scale: 1,
    });

    expect(atlas.meta.format).toBe('I8');
    expect(atlas.meta.frameTags[0]).toMatchObject({ name: 'walk', from: 0, to: 2, direction: 'forward' });
    expect(atlas.frames[0]!.duration).toBe(83);
    expect(atlas.meta.sero.anchors[0]).toMatchObject({ animation: 'walk', x: 2, y: 5 });
    expect(atlas.meta.sero.palette[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('names a one-shot, because Aseprite has no direction for "plays once"', () => {
    const sheet = buildSheet([{ ...animation, loop: 'once' }], {});
    const atlas = buildAtlas(sheet, {
      image: 'x.png',
      characterId: 'x',
      artHeight: 40,
      palette: character.palette,
      scale: 1,
    });
    expect(atlas.meta.sero.once).toEqual(['walk']);
    expect(atlas.meta.frameTags[0]!.direction).toBe('forward');
  });
});

describe('capping the palette', () => {
  const cells = Int16Array.from(
    Array.from({ length: 200 }, (_, i) => i % character.palette.length),
  );

  it('reduces to the cap and keeps the sprite recognisable', () => {
    const capped = capPalette(cells, character.palette, 4);
    expect(capped).toHaveLength(4);
    expect(dedupePalette(capped)).toHaveLength(4);

    const remapped = remapCells(cells, character.palette, capped);
    expect(remapped).toHaveLength(cells.length);
    expect([...remapped].every((index) => index >= 0 && index < 4)).toBe(true);
  });

  it('states what the cap costs before it is approved', () => {
    const gentle = capResidual(cells, character.palette, capPalette(cells, character.palette, 8));
    const harsh = capResidual(cells, character.palette, capPalette(cells, character.palette, 2));
    // Colour residual tracks palette size (D37): a character capped very low
    // will not sit close to its own palette, and the user sees that first.
    expect(harsh).toBeGreaterThan(gentle);
  });

  it('leaves a palette that is already inside the cap alone', () => {
    expect(capPalette(cells, character.palette, 99)).toEqual([...character.palette]);
  });
});

describe('the checks refuse rather than report', () => {
  const still = compiled(Array.from({ length: 6 }, () => ({ dy: 0 })));

  it('passes a clean sequence', () => {
    const findings = checkAnimation(still, {
      loop: 'once',
      limits: { artHeight: character.rows },
    });
    expect(findings.filter((finding) => finding.level === 'refuse')).toEqual([]);
  });

  it('rejects a frame that measures far taller than the character', () => {
    // The knight's white box: a drawn artefact touching the character, which
    // reads as one silhouette 205 art pixels tall against his real 129.
    const findings = checkAnimation(still, {
      loop: 'once',
      limits: { artHeight: character.rows * 2 },
    });
    const refused = findings.filter((finding) => finding.check === 'body-size');
    expect(refused.length).toBe(still.frames.length);
    expect(refused[0]!.level).toBe('refuse');
  });

  it('refuses a jump whose airborne frames never leave the ground', () => {
    const findings = checkAnimation(still, {
      loop: 'once',
      limits: { artHeight: character.rows },
      declaredGrounded: still.frames.map((_, i) => i < 2),
    });
    expect(findings.some((finding) => finding.check === 'root' && finding.level === 'refuse')).toBe(true);
  });

  it('refuses a forward loop that does not close', () => {
    const drifting = compiled(
      Array.from({ length: 12 }, (_, i) => ({ sprite: testCharacter({ crouch: i }) })),
    );
    const findings = checkAnimation(drifting, {
      loop: 'forward',
      limits: { artHeight: character.rows },
    });
    expect(findings.some((finding) => finding.check === 'loop' && finding.level === 'refuse')).toBe(true);
  });

  describe('silhouette continuity', () => {
    /** A clip that is still, then moves fast, then is still again. */
    function movement(changes: number[]): CellGrid[] {
      let width = 4;
      return [
        grid(40, 12, (x) => (x < width ? 0 : TRANSPARENT)),
        ...changes.map((change) => {
          width = Math.max(1, Math.round(width + change));
          return grid(40, 12, (x) => (x < width ? 0 : TRANSPARENT));
        }),
      ];
    }

    it('allows a fast movement, because its neighbours are moving too', () => {
      // Measured on a real jump: the legs open over four frames that change 49,
      // 57, 55 and 37 per cent of the silhouette, and every one of them is a
      // good frame. Refusing them orders a repair on a perfectly good pose, and
      // a stiff animation is the failure no repair path can fix (D30).
      const fast = movement([0, 0, 12, 14, 12, 10, 0, 0]);
      expect(checkContinuity(fast, [0, 4, 8])).toEqual([]);
    });

    it('refuses a redraw, which is a change with nothing moving around it', () => {
      // One frame changes everything while the frames on either side barely
      // move. That is the model redrawing the character, not animating it.
      const redraw = movement([0, 0, 0, 30, -30, 0, 0, 0]);
      const findings = checkContinuity(redraw, [0, 4, 8]);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toMatchObject({ check: 'continuity', level: 'refuse' });
    });
  });

  it('reads a crouch as a pose and a white box as a fault', () => {
    // The knight's box made his silhouette 205 art pixels against his real 129,
    // and a crouch on the jump we generated measures 92 against 136. One is a
    // drawn artefact and the other is the animation, so the check is asymmetric.
    const crouching = compiled(
      Array.from({ length: 6 }, () => ({ sprite: testCharacter({ crouch: 12 }) })),
    );
    const findings = checkAnimation(crouching, {
      loop: 'once',
      limits: { artHeight: character.rows },
    });
    expect(findings.filter((finding) => finding.check === 'body-size')).toEqual([]);

    const tall = checkAnimation(crouching, {
      loop: 'once',
      limits: { artHeight: Math.round(character.rows / 3) },
    });
    expect(tall.some((finding) => finding.check === 'body-size' && finding.level === 'refuse')).toBe(
      true,
    );
  });

  it('counts the litter the quantiser leaves behind', () => {
    const littered = grid(6, 6, (x, y) => (x === 0 && y === 0) || (x === 4 && y === 4) ? 0 : TRANSPARENT);
    expect(countOrphans(littered)).toBe(2);
    expect(countOrphans(grid(6, 6, () => 0))).toBe(0);
  });
});
