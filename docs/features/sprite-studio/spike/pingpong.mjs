/**
 * node pingpong.mjs <clipName> <sprite.png> <plateScale> <keep>
 *
 * The same frames played two ways, so the difference can be watched rather than
 * argued about.
 *
 *   forward   the cycle the finder found, repeated. Joins only if the source
 *             really had a cycle, which four of our five walks did not.
 *   pingpong  forward then backward. The join cannot fail, because the two ends
 *             are the same frame.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';
import { processAnimation } from './sprite2.mjs';

const [name, spritePath, scaleArg, keepArg] = process.argv.slice(2);
const KEEP = Number(keepArg ?? 10);

const base = decodePng(readFileSync(spritePath));
const seen = new Set(), palette = [];
for (let i = 0; i < base.width * base.height; i++) {
  if (base.rgba[i * 4 + 3] < 128) continue;
  const c = [base.rgba[i * 4], base.rgba[i * 4 + 1], base.rgba[i * 4 + 2]];
  const k = c.join(',');
  if (!seen.has(k)) { seen.add(k); palette.push(c); }
}

const work = `ppwork/${name}`;
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-i', `grokwide/${name}.mp4`, '-vf', 'fps=12', `${work}/%03d.png`]);
const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort().map((f) => `${work}/${f}`);

const run = processAnimation(files, { palette, referenceScale: Number(scaleArg) });
const { cols, rows, frames } = run;

const difference = (a, b) => {
  let best = 1;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      let differ = 0, union = 0;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const sy = y + dy, sx = x + dx;
          const p = a[y * cols + x];
          const q = sy >= 0 && sx >= 0 && sy < rows && sx < cols ? b[sy * cols + sx] : -1;
          if (p < 0 && q < 0) continue;
          union++;
          if (p !== q) differ++;
        }
      if (union > 0 && differ / union < best) best = differ / union;
    }
  return best;
};

let best = { period: 0, cost: Infinity };
for (let p = 4; p <= Math.floor(frames.length / 2); p++) {
  let sum = 0, n = 0;
  for (let i = 0; i + p < frames.length; i++) { sum += difference(frames[i], frames[i + p]); n++; }
  if (sum / n < best.cost) best = { period: p, cost: sum / n };
}
let start = { frame: 0, cost: 1 };
for (let s = 0; s + best.period < frames.length; s++) {
  const cost = difference(frames[s], frames[s + best.period]);
  if (cost < start.cost) start = { frame: s, cost };
}

// Even spacing through the cycle is enough here; the point is the join.
const step = Math.max(1, Math.floor(best.period / KEEP));
const cycle = [];
for (let i = 0; i < best.period && cycle.length < KEEP; i += step) cycle.push(start.frame + i);

const forward = cycle;
// Forward, then back down without repeating either end.
const pingpong = [...cycle, ...cycle.slice(1, -1).reverse()];

const toRgba = (cells) => {
  const buf = Buffer.alloc(cols * rows * 4);
  for (let i = 0; i < cols * rows; i++) {
    if (cells[i] < 0) continue;
    const c = palette[cells[i]];
    buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
};
const view = Math.max(2, Math.min(4, Math.floor(300 / Math.max(cols, rows))));
mkdirSync(`loops/${name}-pp`, { recursive: true });
const total = 48;
for (const [label, order] of [['forward', forward], ['pingpong', pingpong]])
  for (let i = 0; i < total; i++) {
    const frame = order[i % order.length];
    const big = scaleUp({ width: cols, height: rows, rgba: toRgba(frames[frame]) }, view);
    writeFileSync(`loops/${name}-pp/${label}-${String(i).padStart(3, '0')}.png`,
      encodePng(big.width, big.height, big.rgba));
  }

console.log(`${name}`);
console.log(`  cycle found     ${best.period} frames from frame ${start.frame}`);
console.log(`  forward join    ${(start.cost * 100).toFixed(0)}% of the sprite differs`);
console.log(`  pingpong join   0% by construction — both ends are the same frame`);
console.log(`  forward  plays  ${forward.length} frames`);
console.log(`  pingpong plays  ${pingpong.length} frames (${forward.length} drawn, the rest reused backwards)`);
console.log(`  drawn at        ${cols * view} x ${rows * view}`);
