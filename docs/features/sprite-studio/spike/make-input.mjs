/**
 * The image both spikes start from.
 *
 * The clean 62 x 136 sprite, enlarged with hard edges, centred on a flat
 * magenta field. Magenta appears nowhere on the character, so every magenta
 * pixel that comes back is background — including the hole inside the whip
 * loop, which the flood fill could not reach.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';

const CANVAS = 1024;
const SCALE = 6;
const MAGENTA = [255, 0, 255];

const sprite = decodePng(readFileSync('art-1x.png'));
const big = scaleUp(sprite, SCALE);

const out = Buffer.alloc(CANVAS * CANVAS * 4);
for (let i = 0; i < CANVAS * CANVAS; i++) {
  out[i * 4] = MAGENTA[0]; out[i * 4 + 1] = MAGENTA[1];
  out[i * 4 + 2] = MAGENTA[2]; out[i * 4 + 3] = 255;
}
const offX = Math.round((CANVAS - big.width) / 2);
const offY = Math.round((CANVAS - big.height) / 2);
for (let y = 0; y < big.height; y++)
  for (let x = 0; x < big.width; x++) {
    const s = (y * big.width + x) * 4;
    if (big.rgba[s + 3] < 128) continue;
    const d = ((offY + y) * CANVAS + offX + x) * 4;
    out[d] = big.rgba[s]; out[d + 1] = big.rgba[s + 1]; out[d + 2] = big.rgba[s + 2]; out[d + 3] = 255;
  }

writeFileSync('input.png', encodePng(CANVAS, CANVAS, out));
console.log(`sprite     ${sprite.width} x ${sprite.height}`);
console.log(`placed at  ${SCALE}x = ${big.width} x ${big.height}, at (${offX},${offY})`);
console.log(`canvas     ${CANVAS} x ${CANVAS} on flat magenta`);
console.log(`baseline   feet at y=${offY + big.height}, centre x=${offX + Math.round(big.width / 2)}`);
