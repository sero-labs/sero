/**
 * node loop-analysis.mjs <workDir> <sprite.png> <scale> <outName>
 *
 * A walk repeats. So somewhere in the clip there is a length at which the
 * animation matches itself. Finding that length is a different question from
 * "does the last frame match the first", and it is the right one to ask.
 *
 * For each candidate cycle length, this measures how well every frame matches
 * the frame one cycle later. The best length is the walk's real period.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';
import { processAnimation } from './sprite2.mjs';

const [work, spritePath, scaleArg, outName] = process.argv.slice(2);
const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort().map((f) => `${work}/${f}`);

const base = decodePng(readFileSync(spritePath));
const seen = new Set(), palette = [];
for (let i = 0; i < base.width * base.height; i++) {
  if (base.rgba[i * 4 + 3] < 128) continue;
  const c = [base.rgba[i * 4], base.rgba[i * 4 + 1], base.rgba[i * 4 + 2]];
  const key = c.join(',');
  if (!seen.has(key)) { seen.add(key); palette.push(c); }
}

const result = processAnimation(files, { palette, referenceScale: Number(scaleArg) });
const { cols, rows, frames } = result;

/** Difference between two frames, at the best small alignment. */
function difference(a, b) {
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
}

// How well the animation matches itself, one cycle later, for each cycle length.
const periods = [];
for (let p = 4; p <= Math.floor(frames.length / 2); p++) {
  let sum = 0, n = 0;
  for (let i = 0; i + p < frames.length; i++) { sum += difference(frames[i], frames[i + p]); n++; }
  periods.push({ period: p, cost: sum / n });
}
periods.sort((a, b) => a.cost - b.cost);
const best = periods[0];

// Within that period, the best place to start the cycle.
let start = { frame: 0, cost: 1 };
for (let s = 0; s + best.period < frames.length; s++) {
  const cost = difference(frames[s], frames[s + best.period]);
  if (cost < start.cost) start = { frame: s, cost };
}

// What the old rule would have produced: cut anywhere after 40% of the clip.
let oldWay = { frame: frames.length - 1, cost: 1 };
for (let f = Math.floor(frames.length * 0.4); f < frames.length; f++) {
  const cost = difference(frames[0], frames[f]);
  if (cost < oldWay.cost) oldWay = { frame: f, cost };
}

console.log(`== ${outName} ==`);
console.log(`  clip            ${frames.length} frames at 12 fps, canvas ${cols} x ${rows}`);
console.log('');
console.log('  cycle length   how well it repeats   (lower is better)');
for (const p of periods.slice(0, 8)) {
  const bar = '#'.repeat(Math.round(p.cost * 120));
  console.log(`    ${String(p.period).padStart(2)} frames        ${(p.cost * 100).toFixed(1).padStart(5)}%  ${bar}`);
}
console.log('  ...');
for (const p of periods.slice(-3)) {
  const bar = '#'.repeat(Math.round(p.cost * 120));
  console.log(`    ${String(p.period).padStart(2)} frames        ${(p.cost * 100).toFixed(1).padStart(5)}%  ${bar}`);
}
console.log('');
console.log(`  best cycle      ${best.period} frames, starting at frame ${start.frame}`);
console.log(`  join quality    ${(start.cost * 100).toFixed(1)}% of the sprite differs across the join`);
console.log(`  old rule gave   ${(oldWay.cost * 100).toFixed(1)}% (cut at frame ${oldWay.frame}, ${oldWay.frame + 1} frames long)`);
console.log(`  improvement     ${(oldWay.cost * 100 - start.cost * 100).toFixed(1)} points, and ` +
            `${oldWay.frame + 1 - best.period} fewer frames`);

// Write both, so the difference can be seen rather than argued about.
mkdirSync(`loops/${outName}`, { recursive: true });
const toRgba = (cells) => {
  const buf = Buffer.alloc(cols * rows * 4);
  for (let i = 0; i < cols * rows; i++) {
    if (cells[i] < 0) continue;
    const c = palette[cells[i]];
    buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
};
function writeSet(label, indexes) {
  const width = cols * indexes.length;
  const sheet = Buffer.alloc(width * rows * 4);
  indexes.forEach((frame, index) => {
    const rgba = toRgba(frames[frame]);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const s = (y * cols + x) * 4, d = (y * width + index * cols + x) * 4;
        sheet[d] = rgba[s]; sheet[d + 1] = rgba[s + 1]; sheet[d + 2] = rgba[s + 2]; sheet[d + 3] = rgba[s + 3];
      }
    const one = scaleUp({ width: cols, height: rows, rgba }, 3);
    writeFileSync(`loops/${outName}/${label}-${String(index).padStart(2, '0')}-3x.png`, encodePng(one.width, one.height, one.rgba));
  });
  const big = scaleUp({ width, height: rows, rgba: sheet }, 2);
  writeFileSync(`loops/${outName}/${label}-sheet.png`, encodePng(big.width, big.height, big.rgba));
}

// Every frame of the real cycle, and the two frames that must match.
const cycle = Array.from({ length: best.period }, (_, i) => start.frame + i);
writeSet('cycle', cycle);
writeSet('join', [start.frame, start.frame + best.period]);
writeSet('oldjoin', [0, oldWay.frame]);
console.log(`  written         loops/${outName}/`);
