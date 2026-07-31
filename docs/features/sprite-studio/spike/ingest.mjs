/**
 * node ingest.mjs <character.png> <outPrefix>
 *
 * Ingestion on a generated character: key the background, find the art grid,
 * recover the sprite at its true size, and extract the palette. The same steps
 * as the reference recovery, but keyed on magenta instead of flood filled.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';

const [input, prefix] = process.argv.slice(2);
const img = decodePng(readFileSync(input));
const at = (x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
};
const isKey = (p) =>
  Math.abs(p[0] - 255) + Math.abs(p[1]) + Math.abs(p[2] - 255) < 120 ||
  (p[0] > 150 && p[2] > 150 && p[1] < 90 && Math.abs(p[0] - p[2]) < 70);

let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
for (let y = 0; y < img.height; y++)
  for (let x = 0; x < img.width; x++)
    if (!isKey(at(x, y))) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);

// The grid is the cell size at which real colour edges line up far more often
// than chance allows. Harmonics show at multiples, so the smallest strong
// candidate is the answer.
const edgesX = [], edgesY = [];
for (let y = minY; y <= maxY; y++)
  for (let x = minX + 1; x <= maxX; x++)
    if (dist(at(x, y), at(x - 1, y)) > 60) edgesX.push(x);
for (let x = minX; x <= maxX; x++)
  for (let y = minY + 1; y <= maxY; y++)
    if (dist(at(x, y), at(x, y - 1)) > 60) edgesY.push(y);

function lift(edges, b) {
  let best = 0;
  for (let phase = 0; phase < b; phase++) {
    let hits = 0;
    for (const e of edges) if ((e - phase) % b === 0) hits++;
    if (hits > best) best = hits;
  }
  return (best / edges.length) / (1 / b);
}
let block = 1, bestLift = 0;
for (let b = 2; b <= 16; b++) {
  const l = Math.min(lift(edgesX, b), lift(edgesY, b));
  if (l > bestLift * 1.15) { bestLift = l; block = b; }
}

function phaseFor(axis) {
  let best = 0, bestHits = -1;
  const edges = axis === 'x' ? edgesX : edgesY;
  for (let phase = 0; phase < block; phase++) {
    let hits = 0;
    for (const e of edges) if ((e - phase) % block === 0) hits++;
    if (hits > bestHits) { bestHits = hits; best = phase; }
  }
  return best;
}
const phaseX = phaseFor('x'), phaseY = phaseFor('y');

const startX = minX - ((minX - phaseX) % block + block) % block;
const startY = minY - ((minY - phaseY) % block + block) % block;
const cols = Math.ceil((maxX + 1 - startX) / block);
const rows = Math.ceil((maxY + 1 - startY) / block);

const palette = [];
const cells = [];
for (let ry = 0; ry < rows; ry++) {
  const row = [];
  for (let rx = 0; rx < cols; rx++) {
    const tally = new Map();
    for (let y = 0; y < block; y++)
      for (let x = 0; x < block; x++) {
        const px = startX + rx * block + x, py = startY + ry * block + y;
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const p = at(px, py);
        if (isKey(p)) continue;
        const key = `${p[0] >> 2},${p[1] >> 2},${p[2] >> 2}`;
        const seen = tally.get(key);
        if (seen) { seen.n++; seen.r += p[0]; seen.g += p[1]; seen.b += p[2]; }
        else tally.set(key, { n: 1, r: p[0], g: p[1], b: p[2] });
      }
    let total = 0;
    for (const v of tally.values()) total += v.n;
    if (total < block * block * 0.5) { row.push(-1); continue; }
    const win = [...tally.values()].sort((a, b) => b.n - a.n)[0];
    const colour = [Math.round(win.r / win.n), Math.round(win.g / win.n), Math.round(win.b / win.n)];
    let index = palette.findIndex((p) => dist(p, colour) < 24);
    if (index < 0) { palette.push(colour); index = palette.length - 1; }
    row.push(index);
  }
  cells.push(row);
}

const rgba = Buffer.alloc(cols * rows * 4);
for (let y = 0; y < rows; y++)
  for (let x = 0; x < cols; x++) {
    const index = cells[y][x];
    if (index < 0) continue;
    const c = palette[index], o = (y * cols + x) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  }
writeFileSync(`${prefix}-1x.png`, encodePng(cols, rows, rgba));
const big = scaleUp({ width: cols, height: rows, rgba }, 6);
writeFileSync(`${prefix}-6x.png`, encodePng(big.width, big.height, big.rgba));

console.log(`${prefix}: block ${block} (lift ${bestLift.toFixed(1)}x), sprite ${cols} x ${rows}, ${palette.length} colours`);
