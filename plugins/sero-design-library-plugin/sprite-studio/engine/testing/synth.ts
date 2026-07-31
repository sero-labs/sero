/**
 * Test material with a known answer.
 *
 * A real clip cannot test this code, because nobody knows what the right result
 * is. So these plates are built here: a sprite is moved along an arc chosen in
 * the test, by an amount chosen in the test, with noise chosen in the test. If
 * the pipeline reports something else, the fault is in the pipeline.
 *
 * In memory rather than on disk — the engine has no file system, and neither do
 * its tests.
 */

import type { Palette, Rgb, SourceImage, SourcePlate } from './../types';
import { TRANSPARENT } from './../types';

export const CANVAS = 1024;
const MAGENTA: Rgb = [255, 0, 255];

export interface SynthFrame {
  dx?: number;
  dy?: number;
  /** Relights the whole character: every colour moves, the shape does not. */
  tint?: number;
  /**
   * A different pose for this frame.
   *
   * Moving the whole character and calling it a walk does not test anything:
   * drift correction removes the sway, so every frame becomes identical and any
   * pair of them "loops" perfectly. A loop test needs the character to actually
   * change shape.
   */
  sprite?: { cols: number; rows: number; cells: Int16Array };
}

export interface SynthOptions {
  sprite: { cols: number; rows: number; cells: Int16Array };
  palette: Palette;
  /** Whole-number enlargement, standing in for the model's drawing scale. */
  scale: number;
  frames: SynthFrame[];
  noise?: number;
  /** Milliseconds each plate holds, matching a 12 fps sample. */
  durationMs?: number;
  canvas?: number;
}

export interface SynthSequence {
  plates: SourcePlate[];
  /** Where the sprite rests, in source pixels. */
  restX: number;
  restY: number;
  /** How far the feet travel over the sequence, in art pixels. */
  footTravel: number;
  /** How many plates put any part of the sprite outside the picture. */
  clipped: number;
}

/** A deterministic generator, so a run can be repeated exactly. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function plate(options: SynthOptions, frame: SynthFrame, seed: number, rest: { x: number; y: number }): SourceImage {
  const canvas = options.canvas ?? CANVAS;
  const { palette, scale } = options;
  const sprite = frame.sprite ?? options.sprite;
  const data = new Uint8Array(canvas * canvas * 4);
  for (let i = 0; i < canvas * canvas; i++) {
    data[i * 4] = MAGENTA[0];
    data[i * 4 + 1] = MAGENTA[1];
    data[i * 4 + 2] = MAGENTA[2];
    data[i * 4 + 3] = 255;
  }

  const next = random(seed);
  const noise = options.noise ?? 0;
  const tint = frame.tint ?? 1;
  const jitter = (): number => (noise > 0 ? Math.round((next() * 2 - 1) * noise) : 0);
  const clamp = (value: number): number => Math.max(0, Math.min(255, value));

  for (let y = 0; y < sprite.rows * scale; y++)
    for (let x = 0; x < sprite.cols * scale; x++) {
      const index = sprite.cells[Math.floor(y / scale) * sprite.cols + Math.floor(x / scale)] ?? TRANSPARENT;
      if (index < 0) continue;
      const colour = palette[index];
      if (colour === undefined) continue;
      const px = rest.x + (frame.dx ?? 0) + x;
      const py = rest.y + (frame.dy ?? 0) + y;
      if (px < 0 || py < 0 || px >= canvas || py >= canvas) continue;
      const at = (py * canvas + px) * 4;
      data[at] = clamp(Math.round(colour[0] * tint) + jitter());
      data[at + 1] = clamp(Math.round(colour[1] * tint) + jitter());
      data[at + 2] = clamp(Math.round(colour[2] * tint) + jitter());
      data[at + 3] = 255;
    }

  return { width: canvas, height: canvas, data };
}

export function makeSequence(options: SynthOptions): SynthSequence {
  const canvas = options.canvas ?? CANVAS;
  const width = options.sprite.cols * options.scale;
  const height = options.sprite.rows * options.scale;
  const rest = { x: Math.round((canvas - width) / 2), y: canvas - 90 - height };
  const durationMs = options.durationMs ?? Math.round(1000 / 12);

  const plates = options.frames.map((frame, i) => ({
    image: plate(options, frame, 1000 + i, rest),
    durationMs,
  }));

  const rises = options.frames.map((frame) => -(frame.dy ?? 0));
  return {
    plates,
    restX: rest.x,
    restY: rest.y,
    footTravel: (Math.max(...rises) - Math.min(...rises)) / options.scale,
    clipped: options.frames.filter(
      (frame) =>
        rest.y + (frame.dy ?? 0) < 0 ||
        rest.y + (frame.dy ?? 0) + height > canvas ||
        rest.x + (frame.dx ?? 0) < 0 ||
        rest.x + (frame.dx ?? 0) + width > canvas,
    ).length,
  };
}

/**
 * A stand-in character: a body, a head, a pair of legs and a held object that
 * hangs below the feet.
 *
 * Two details are load-bearing, and both are there because a real sprite has
 * them:
 *
 *  - **The hanging blade.** It is what made a 75 pixel jump measure as 8 when
 *    the foot line was the lowest pixel of the silhouette (D35). Without one in
 *    the test material the fix is untested.
 *  - **Ramps of near-identical shades.** Boil is a cell flipping between two
 *    entries that are a few units apart. A palette of six well-separated colours
 *    cannot flicker however much noise is added to it, so the flicker test would
 *    pass against a quantiser that had no memory at all.
 */
export interface Pose {
  /** How far the legs are apart, in art pixels. */
  legSwing?: number;
  /** How far the arms have swung, in art pixels. */
  armSwing?: number;
  /**
   * How far the character has collapsed, in art pixels. Every step of it makes
   * a silhouette that has not been held before, which is what an animation with
   * no loop in it actually looks like — a death, or a walk that never repeats.
   */
  crouch?: number;
}

export function testCharacter(
  pose: Pose = {},
): { cols: number; rows: number; cells: Int16Array; palette: Rgb[] } {
  const cols = 24;
  const rows = 40;
  const legSwing = Math.round(pose.legSwing ?? 0);
  const armSwing = Math.round(pose.armSwing ?? 0);
  const crouch = Math.max(0, Math.round(pose.crouch ?? 0));
  const palette: Rgb[] = [
    [63, 107, 52], // shirt
    [70, 114, 59], // shirt, one shade up
    [56, 100, 45], // shirt, one shade down
    [138, 90, 52], // leather
    [145, 97, 59], // leather, one shade up
    [227, 181, 140], // skin
    [234, 188, 147], // skin, one shade up
    [35, 26, 18], // boots
    [200, 200, 210], // blade
    [207, 207, 217], // blade highlight
  ];
  const cells = new Int16Array(cols * rows).fill(TRANSPARENT);
  const set = (x: number, y: number, index: number): void => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    cells[y * cols + x] = index;
  };

  // Features sit on odd boundaries as well as even ones, as real pixel art
  // does. A character drawn entirely on even art pixels aligns just as well to a
  // grid of twice the size, and the grid detector would be right to say so.
  for (let y = 3; y < 11; y++) for (let x = 8; x < 15; x++) set(x, y + crouch, y % 3 === 0 ? 6 : 5); // head
  for (let y = 11; y < 27; y++)
    for (let x = 6; x < 17; x++) set(x, y + crouch, y % 5 === 0 ? 2 : x % 3 === 0 ? 1 : 0); // body
  for (let y = 13; y < 23; y++) for (let x = 3; x < 6; x++) set(x, y + crouch + armSwing, 3); // left arm
  for (let y = 13; y < 23; y++) for (let x = 17; x < 20; x++) set(x, y + crouch - armSwing, 4); // right arm
  // The legs shorten as the character collapses; the boots stay on the floor.
  for (let y = 27 + crouch; y < 37; y++) for (let x = 7; x < 11; x++) set(x - legSwing, y, 3);
  for (let y = 27 + crouch; y < 37; y++) for (let x = 12; x < 16; x++) set(x + legSwing, y, 4);
  for (let y = 37; y < 39; y++) {
    for (let x = 7 - legSwing; x < 11 - legSwing; x++) set(x, y, 7);
    for (let x = 12 + legSwing; x < 16 + legSwing; x++) set(x, y, 7);
  }
  // Single-art-pixel detail at odd coordinates — eyes, a belt, buttons.
  //
  // Not decoration. A character drawn entirely on even art pixels lines up just
  // as well to a grid of twice the size, and the grid detector is right to say
  // so: it reports 16 for artwork enlarged 8 times, and it is not wrong, the
  // material is. Real pixel art carries detail at every pixel, which is what
  // anchors the answer, and the test material has to as well.
  set(10, 6 + crouch, 7);
  set(13, 6 + crouch, 7);
  for (let x = 6; x < 17; x++) set(x, 19 + crouch, 7); // belt
  for (const y of [13, 15, 17]) set(11, y + crouch, 2); // buttons

  // The blade, held in the right hand and hanging below the boots. It has to
  // touch the hand: anything not joined to the character is not the character
  // and is dropped (D35), and a test whose blade is detached tests nothing.
  // It is what made a jump of 75 pixels measure as 8 before the foot line
  // became the lowest solid row rather than the lowest pixel.
  for (let y = 21 + crouch; y < 40; y++) set(19, y, y % 4 === 0 ? 9 : 8);

  return { cols, rows, cells, palette };
}

/** One frame of a walk: the legs scissor and the arms counter-swing. */
export function walkPose(phase: number): { cols: number; rows: number; cells: Int16Array } {
  return testCharacter({
    legSwing: Math.round(Math.sin(phase * Math.PI * 2) * 3),
    armSwing: Math.round(Math.sin(phase * Math.PI * 2 + Math.PI) * 2),
  });
}
