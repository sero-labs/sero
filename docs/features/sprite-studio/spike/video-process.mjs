/**
 * node video-process.mjs <name> <clip.mp4> [keepFrames]
 *
 * A clip is 60 or more near-identical pictures. A sprite needs about ten that
 * carry the movement. Frames are kept when enough has changed since the last
 * one kept, so still moments cost nothing and fast moments keep their detail.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { encodePng, scaleUp } from './png.mjs';
import { loadPalette, processSequence, toRgba, sheet } from './sprite.mjs';

const [name, clip, keepArg] = process.argv.slice(2);
const KEEP = Number(keepArg ?? 10);
const SAMPLE_FPS = 12;

const work = `work/${name}`;
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-vf', `fps=${SAMPLE_FPS}`, `${work}/%03d.png`]);
const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort().map((f) => `${work}/${f}`);
console.log(`${name}: ${files.length} frames sampled at ${SAMPLE_FPS} fps`);

const palette = loadPalette('art-1x.png');
const all = processSequence(files, { palette, artHeight: 136 });
const { cols, rows } = all;

// Keep a frame when enough has changed since the last one kept.
const kept = [0];
let threshold = 0.06;
for (let pass = 0; pass < 12; pass++) {
  kept.length = 1;
  let last = 0;
  for (let i = 1; i < all.frames.length; i++) {
    let changed = 0, union = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const a = all.frames[last].cells[y][x], b = all.frames[i].cells[y][x];
        if (!a && !b) continue;
        union++;
        if (!a || !b || a.join() !== b.join()) changed++;
      }
    if (union > 0 && changed / union >= threshold) { kept.push(i); last = i; }
  }
  if (kept.length <= KEEP) break;
  threshold *= 1.3;
}

const chosen = kept.slice(0, KEEP).map((i) => all.frames[i]);
mkdirSync(`out/${name}`, { recursive: true });
chosen.forEach((frame, i) => {
  const rgba = toRgba(frame.cells, cols, rows);
  writeFileSync(`out/${name}/frame-${String(i).padStart(2, '0')}.png`, encodePng(cols, rows, rgba));
  const big = scaleUp({ width: cols, height: rows, rgba }, 4);
  writeFileSync(`out/${name}/frame-${String(i).padStart(2, '0')}-4x.png`, encodePng(big.width, big.height, big.rgba));
});
const strip = sheet(chosen, cols, rows);
writeFileSync(`out/${name}/sheet.png`, encodePng(strip.width, strip.height, strip.rgba));
const bigStrip = scaleUp(strip, 4);
writeFileSync(`out/${name}/sheet-4x.png`, encodePng(bigStrip.width, bigStrip.height, bigStrip.rgba));

const heights = all.frames.map((f) => f.artHeight);
const offPalette = all.frames.map((f) => f.offPalette / Math.max(f.drawn, 1));
console.log(`  canvas        ${cols} x ${rows} art pixels`);
console.log(`  kept          ${chosen.length} of ${files.length} frames (change threshold ${(threshold * 100).toFixed(1)}%)`);
console.log(`  height        ${Math.min(...heights).toFixed(1)} to ${Math.max(...heights).toFixed(1)} art pixels ` +
            `(spread ${(Math.max(...heights) - Math.min(...heights)).toFixed(1)})`);
console.log(`  off-palette   ${(Math.min(...offPalette) * 100).toFixed(1)}% to ${(Math.max(...offPalette) * 100).toFixed(1)}%`);
const drifts = all.frames.slice(1).map((f) => Math.abs(f.residualDrift[0]) + Math.abs(f.residualDrift[1]));
console.log(`  drift left    up to ${Math.max(...drifts)} px after anchoring`);
console.log(`  written       out/${name}/sheet-4x.png`);
