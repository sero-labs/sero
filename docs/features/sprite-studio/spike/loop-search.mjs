/**
 * node loop-search.mjs <clipName> <sprite.png> <plateScale>
 *
 * A better way to find the loop, and a test of the bridge idea.
 *
 * The old search chose a cycle length first, by how well the whole clip repeats
 * at that spacing, and only then chose where to start. That throws away good
 * loops: a clip can contain one excellent pair of matching moments without
 * repeating at any fixed spacing at all.
 *
 * This looks at every start and end pair directly and asks one question — if I
 * play from s to e and then jump back to s, how big is the jump?
 *
 * Then the bridge: when the best pair is still poor, look elsewhere in the clip
 * for a short run of frames that leads out of e and into s.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { decodePng } from './png.mjs';
import { processAnimation } from './sprite2.mjs';

const [name, spritePath, scaleArg] = process.argv.slice(2);
const MIN_LENGTH = 6;

const base = decodePng(readFileSync(spritePath));
const seen = new Set(), palette = [];
for (let i = 0; i < base.width * base.height; i++) {
  if (base.rgba[i * 4 + 3] < 128) continue;
  const c = [base.rgba[i * 4], base.rgba[i * 4 + 1], base.rgba[i * 4 + 2]];
  const k = c.join(',');
  if (!seen.has(k)) { seen.add(k); palette.push(c); }
}

const work = `lswork/${name}`;
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-i', `grokwide/${name}.mp4`, '-vf', 'fps=12', `${work}/%03d.png`]);
const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort().map((f) => `${work}/${f}`);

const { cols, rows, frames } = processAnimation(files, { palette, referenceScale: Number(scaleArg) });
const n = frames.length;

/** Straight difference, no alignment search — fast enough for every pair. */
function diff(a, b) {
  let differ = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = b[i];
    if (p < 0 && q < 0) continue;
    union++;
    if (p !== q) differ++;
  }
  return union > 0 ? differ / union : 1;
}

const D = [];
for (let i = 0; i < n; i++) {
  D.push(new Float32Array(n));
  for (let j = 0; j < i; j++) { D[i][j] = diff(frames[i], frames[j]); D[j] && (D[j][i] = D[i][j]); }
}

// Every loop the clip can make on its own.
const pairs = [];
for (let s = 0; s < n; s++)
  for (let e = s + MIN_LENGTH; e < n; e++) pairs.push({ s, e, cost: D[e][s], length: e - s + 1 });
pairs.sort((a, b) => a.cost - b.cost);

console.log(`== ${name} ==  ${n} frames, canvas ${cols} x ${rows}`);
console.log('');
console.log('best loops found by looking at every start and end pair:');
for (const p of pairs.slice(0, 5))
  console.log(`   frames ${String(p.s).padStart(2)}..${String(p.e).padStart(2)}  ` +
    `${String(p.length).padStart(2)} long   join ${(p.cost * 100).toFixed(1)}%`);

// The bridge: a short run somewhere else that leads out of e and back into s.
const best = pairs[0];
let bridge = null;
for (let length = 1; length <= 4 && !bridge; length++) {
  let found = { cost: Infinity };
  for (let b = 0; b + length < n; b++) {
    if (b >= best.s - length && b <= best.e) continue;        // must come from outside the loop
    const out = D[best.e][b];                                 // e leads into the bridge
    const back = D[b + length - 1][best.s];                   // the bridge leads into s
    const cost = Math.max(out, back);
    if (cost < found.cost) found = { cost, start: b, length, out, back };
  }
  if (found.cost < best.cost) bridge = found;
}

console.log('');
if (bridge) {
  console.log(`a bridge helps: ${bridge.length} frame(s) from ${bridge.start}`);
  console.log(`   worst join across the bridge ${(bridge.cost * 100).toFixed(1)}%, against ${(best.cost * 100).toFixed(1)}% direct`);
} else {
  console.log(`no bridge beats the direct join of ${(best.cost * 100).toFixed(1)}%`);
}
