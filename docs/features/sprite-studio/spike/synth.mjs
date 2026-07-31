/**
 * Test material with a known answer.
 *
 * A real clip cannot test my code, because I do not know what the right result
 * is. So these frames are built here: the sprite is moved along an arc I chose,
 * by an amount I chose, with noise I chose. If the pipeline reports something
 * else, the fault is in the pipeline.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';

const CANVAS = 1024;
const MAGENTA = [255, 0, 255];

/**
 * Render one plate: the sprite at a whole-number scale, offset by (dx, dy)
 * source pixels from its resting place, with optional colour noise.
 */
function plate(sprite, scale, restX, restY, dx, dy, noise, seed, tint = 1) {
  const big = scaleUp(sprite, scale);
  const buf = Buffer.alloc(CANVAS * CANVAS * 4);
  for (let i = 0; i < CANVAS * CANVAS; i++) {
    buf[i * 4] = MAGENTA[0]; buf[i * 4 + 1] = MAGENTA[1];
    buf[i * 4 + 2] = MAGENTA[2]; buf[i * 4 + 3] = 255;
  }
  // A tiny deterministic generator, so a run can be repeated exactly.
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let y = 0; y < big.height; y++)
    for (let x = 0; x < big.width; x++) {
      const s = (y * big.width + x) * 4;
      if (big.rgba[s + 3] < 128) continue;
      const px = restX + dx + x, py = restY + dy + y;
      if (px < 0 || py < 0 || px >= CANVAS || py >= CANVAS) continue;
      const d = (py * CANVAS + px) * 4;
      const jitter = noise > 0 ? () => Math.round((random() * 2 - 1) * noise) : () => 0;
      // `tint` relights the whole character. Every colour moves, but the shape
      // does not — the case where a legal palette is still the wrong palette.
      buf[d] = Math.max(0, Math.min(255, Math.round(big.rgba[s] * tint) + jitter()));
      buf[d + 1] = Math.max(0, Math.min(255, Math.round(big.rgba[s + 1] * tint) + jitter()));
      buf[d + 2] = Math.max(0, Math.min(255, Math.round(big.rgba[s + 2] * tint) + jitter()));
      buf[d + 3] = 255;
    }
  return { width: CANVAS, height: CANVAS, rgba: buf };
}

/** Write a whole sequence and return what the truth is, for comparison. */
export function makeSequence(name, { spritePath, scale, frames, noise = 0, tint = 1 }) {
  const sprite = decodePng(readFileSync(spritePath));
  const big = { width: sprite.width * scale, height: sprite.height * scale };
  const restX = Math.round((CANVAS - big.width) / 2);
  const restY = CANVAS - 90 - big.height;

  const dir = `synth/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  frames.forEach((f, i) => {
    const image = plate(sprite, scale, restX, restY, f.dx ?? 0, f.dy ?? 0, noise, 1000 + i, f.tint ?? tint);
    writeFileSync(`${dir}/${String(i).padStart(3, '0')}.png`, encodePng(CANVAS, CANVAS, image.rgba));
  });

  return {
    dir, scale,
    restY, restX,
    spriteHeight: sprite.height,
    // The truth, in art pixels: how far the feet travel over the sequence.
    footTravel: (Math.max(...frames.map((f) => -(f.dy ?? 0))) - Math.min(...frames.map((f) => -(f.dy ?? 0)))) / scale,
    // Which frames put any part of the sprite outside the plate.
    clipped: frames.filter((f) => restY + (f.dy ?? 0) < 0 ||
      restY + (f.dy ?? 0) + big.height > CANVAS ||
      restX + (f.dx ?? 0) < 0 ||
      restX + (f.dx ?? 0) + big.width > CANVAS).length,
  };
}
