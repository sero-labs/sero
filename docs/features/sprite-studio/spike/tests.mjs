/**
 * node tests.mjs
 *
 * Four checks against material with a known answer. Each one prints what the
 * answer should be, what the pipeline said, and whether that is close enough.
 * No money is spent and no video service is used.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';
import { makeSequence } from './synth.mjs';
import { processAnimation, quantiseSequence, staticChurn } from './sprite2.mjs';

const SPRITE = 'art-1x.png';
const SCALE = 3;                       // the airborne plate scale for the explorer

function paletteOf(path) {
  const img = decodePng(readFileSync(path));
  const seen = new Set(), palette = [];
  for (let i = 0; i < img.width * img.height; i++) {
    if (img.rgba[i * 4 + 3] < 128) continue;
    const c = [img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]];
    const key = c.join(',');
    if (!seen.has(key)) { seen.add(key); palette.push(c); }
  }
  return palette;
}
const palette = paletteOf(SPRITE);
const filesIn = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => `${dir}/${f}`);

const results = [];
const check = (name, expected, actual, ok, note = '') =>
  results.push({ name, expected, actual, ok, note });

// --- 1. A jump of a size I chose. Does the pipeline report that size? --------
{
  const RISE = 40;                     // art pixels
  const frames = [];
  for (let i = 0; i < 30; i++) {
    // Flat, then a parabola, then flat again.
    const t = (i - 5) / 19;
    const height = i < 5 || i > 24 ? 0 : Math.sin(Math.PI * t) * RISE;
    frames.push({ dy: -Math.round(height * SCALE) });
  }
  const truth = makeSequence('arc', { spritePath: SPRITE, scale: SCALE, frames });
  const run = processAnimation(filesIn(truth.dir), { palette, referenceScale: SCALE });
  const travel = Math.max(...run.footHeights) - Math.min(...run.footHeights);
  const airborne = run.grounded.filter((g) => !g).length;
  check('jump height is reported correctly', `${RISE} art px`, `${travel.toFixed(1)} art px`,
    Math.abs(travel - RISE) <= 1.5);
  check('frames off the ground are found', '20 of 30', `${airborne} of 30`,
    Math.abs(airborne - 20) <= 3);
  check('no frame is reported as cut', '0', `${run.measures.filter((m) => m.clipped).length}`,
    run.measures.filter((m) => m.clipped).length === 0);
}

// --- 2. A jump too big for the plate. Is the cut-off caught? -----------------
{
  const RISE = 200;
  const frames = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    frames.push({ dy: -Math.round(Math.sin(Math.PI * t) * RISE * SCALE) });
  }
  const truth = makeSequence('clipped', { spritePath: SPRITE, scale: SCALE, frames });
  const run = processAnimation(filesIn(truth.dir), { palette, referenceScale: SCALE });
  const found = run.measures.filter((m) => m.clipped).length;
  check('cut-off frames are caught', `${truth.clipped} of 20`, `${found} of 20`,
    Math.abs(found - truth.clipped) <= 1,
    'this is the fault nothing downstream can repair');
}

// --- 3. A cycle of a length I chose. Is that length found? -------------------
{
  const PERIOD = 12, REPEATS = 4;
  const frames = [];
  for (let i = 0; i < PERIOD * REPEATS; i++) {
    const phase = (i % PERIOD) / PERIOD * Math.PI * 2;
    frames.push({
      dy: -Math.round(Math.abs(Math.sin(phase)) * 4 * SCALE),
      dx: Math.round(Math.sin(phase) * 3 * SCALE),
    });
  }
  const truth = makeSequence('cycle', { spritePath: SPRITE, scale: SCALE, frames });
  const run = processAnimation(filesIn(truth.dir), { palette, referenceScale: SCALE });
  const { cols, rows, frames: cells } = run;
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
  for (let p = 4; p <= Math.floor(cells.length / 2); p++) {
    let sum = 0, n = 0;
    for (let i = 0; i + p < cells.length; i++) { sum += difference(cells[i], cells[i + p]); n++; }
    if (sum / n < best.cost) best = { period: p, cost: sum / n };
  }
  check('cycle length is found', `${PERIOD} frames`, `${best.period} frames`, best.period === PERIOD,
    `match quality ${(best.cost * 100).toFixed(1)}%`);
}

// --- 4. A still sprite with noise. Does colour memory remove the flicker? ----
{
  const frames = Array.from({ length: 20 }, () => ({ dy: 0 }));
  const truth = makeSequence('noise', { spritePath: SPRITE, scale: SCALE, frames, noise: 18 });
  const run = processAnimation(filesIn(truth.dir), { palette, referenceScale: SCALE });
  const off = quantiseSequence(run.grids, palette, { memory: false });
  const on = quantiseSequence(run.grids, palette, { memory: true });
  const churnOff = staticChurn(run.grids, off.frames, off.offsets).churn * 100;
  const churnOn = staticChurn(run.grids, on.frames, on.offsets).churn * 100;
  check('flicker is removed on a still sprite', 'under 1%', `${churnOn.toFixed(2)}%`, churnOn < 1,
    `without memory it is ${churnOff.toFixed(2)}%`);
}

// --- 5. A relit character. Legal colours, wrong colours. -------------------
{
  // Half the frames are the character as drawn; half are the same character
  // 15% darker. The shape never changes, so a silhouette check sees nothing and
  // every colour still lands on the palette. Only fidelity should notice.
  const frames = Array.from({ length: 16 }, (_, i) => ({ dy: 0, tint: i < 8 ? 1 : 0.85 }));
  const truth = makeSequence('relit', { spritePath: SPRITE, scale: SCALE, frames });
  const run = processAnimation(filesIn(truth.dir), { palette, referenceScale: SCALE });
  const asDrawn = run.residuals.slice(0, 8).reduce((a, b) => a + b, 0) / 8 * 1000;
  const relit = run.residuals.slice(8).reduce((a, b) => a + b, 0) / 8 * 1000;
  check('relighting is noticed', 'a clear rise', `${asDrawn.toFixed(1)} then ${relit.toFixed(1)}`,
    relit > asDrawn * 1.8, 'the shape never changed, so only colour could show it');
}

console.log('');
console.log('check                                  should be        was              result');
for (const r of results) {
  console.log(
    `${r.name.padEnd(38)} ${String(r.expected).padEnd(16)} ${String(r.actual).padEnd(16)} ` +
    `${r.ok ? 'PASS' : 'FAIL'}${r.note ? `   ${r.note}` : ''}`,
  );
}
const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(`${results.length - failed} passed, ${failed} failed`);
