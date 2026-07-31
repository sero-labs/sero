/**
 * node run-wide.mjs
 *
 * Every clip of the wider test through the upgraded pipeline, and one table.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';
import { processAnimation, loopClosure } from './sprite2.mjs';

const SAMPLE_FPS = 12;
const LOOPING = new Set(['walk']);
const KEEP = { walk: 8, jump: 10, death: 10 };

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

const manifest = JSON.parse(readFileSync('characters/manifest.json', 'utf8'));
mkdirSync('out-wide', { recursive: true });
const rows = [];

for (const character of manifest) {
  const palette = paletteOf(character.sprite);
  for (const action of ['walk', 'jump', 'death']) {
    const id = `${character.id}-${action}`;
    const clip = `wide/${id}.mp4`;
    if (!existsSync(clip)) { console.log(`missing ${clip}`); continue; }

    const work = `work-wide/${id}`;
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-vf', `fps=${SAMPLE_FPS}`, `${work}/%03d.png`]);
    const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort().map((f) => `${work}/${f}`);

    const result = processAnimation(files, { palette, referenceScale: character.scale });
    const { cols, rows: canvasRows } = result;
    let frames = result.frames;

    let loopCost = null, loopEnd = null;
    if (LOOPING.has(action)) {
      let best = { frame: frames.length - 1, cost: 1 };
      for (let f = Math.floor(frames.length * 0.4); f < frames.length; f++) {
        const cost = loopClosure([frames[0], frames[f]], cols, canvasRows);
        if (cost < best.cost) best = { frame: f, cost };
      }
      loopCost = best.cost;
      loopEnd = loopClosure(frames, cols, canvasRows);
      frames = frames.slice(0, best.frame + 1);
    }

    // Thinning: endpoints and reach extremes first, then whatever is worst represented.
    const reach = frames.map((cells) => {
      let far = 0;
      for (let y = 0; y < canvasRows; y++)
        for (let x = 0; x < cols; x++)
          if (cells[y * cols + x] >= 0) {
            const d = Math.hypot(x - result.anchorCol, y - result.anchorRow);
            if (d > far) far = d;
          }
      return far;
    });
    const keep = new Set([0, frames.length - 1]);
    for (let i = 1; i < frames.length - 1; i++) {
      const a = reach[i] - reach[i - 1], b = reach[i + 1] - reach[i];
      if ((a > 0 && b < 0) || (a < 0 && b > 0)) keep.add(i);
    }
    const silhouette = (p, q) => {
      let differ = 0, union = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i] >= 0, b = q[i] >= 0;
        if (!a && !b) continue;
        union++;
        if (a !== b) differ++;
      }
      return union > 0 ? differ / union : 0;
    };
    const kept = [...keep].sort((x, y) => x - y);
    while (kept.length < KEEP[action]) {
      let worst = -1, cost = -1;
      for (let i = 0; i < frames.length; i++) {
        if (kept.includes(i)) continue;
        const near = kept.reduce((best, k) => (Math.abs(k - i) < Math.abs(best - i) ? k : best), kept[0]);
        const c = silhouette(frames[i], frames[near]);
        if (c > cost) { cost = c; worst = i; }
      }
      if (worst < 0 || cost <= 0) break;
      kept.push(worst); kept.sort((x, y) => x - y);
    }

    // Sheet.
    mkdirSync(`out-wide/${id}`, { recursive: true });
    const toRgba = (cells) => {
      const buf = Buffer.alloc(cols * canvasRows * 4);
      for (let i = 0; i < cols * canvasRows; i++) {
        if (cells[i] < 0) continue;
        const c = palette[cells[i]];
        buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2]; buf[i * 4 + 3] = 255;
      }
      return buf;
    };
    const width = cols * kept.length;
    const sheet = Buffer.alloc(width * canvasRows * 4);
    kept.forEach((frame, index) => {
      const rgba = toRgba(frames[frame]);
      for (let y = 0; y < canvasRows; y++)
        for (let x = 0; x < cols; x++) {
          const s = (y * cols + x) * 4, d = (y * width + index * cols + x) * 4;
          sheet[d] = rgba[s]; sheet[d + 1] = rgba[s + 1]; sheet[d + 2] = rgba[s + 2]; sheet[d + 3] = rgba[s + 3];
        }
    });
    writeFileSync(`out-wide/${id}/sheet.png`, encodePng(width, canvasRows, sheet));
    const scale = Math.max(1, Math.min(4, Math.floor(900 / Math.max(width, 1)) || 1));
    const big = scaleUp({ width, height: canvasRows, rgba: sheet }, scale);
    writeFileSync(`out-wide/${id}/sheet-${scale}x.png`, encodePng(big.width, big.height, big.rgba));
    kept.forEach((frame, i) => {
      const rgba = toRgba(frames[frame]);
      const f = scaleUp({ width: cols, height: canvasRows, rgba }, 3);
      writeFileSync(`out-wide/${id}/frame-${String(i).padStart(2, '0')}-3x.png`, encodePng(f.width, f.height, f.rgba));
    });

    const heights = result.measures.map((m) => m.height / result.scale);
    const airborne = result.grounded.filter((g) => !g).length;
    const footTravel = Math.max(...result.footHeights) - Math.min(...result.footHeights);
    const clipped = result.measures.filter((m) => m.clipped).length;
    rows.push({
      id, action, clipped, sampled: result.measures.length,
      canvas: `${cols}x${canvasRows}`,
      grounded: `${result.grounded.length - airborne}/${result.grounded.length}`,
      trusted: result.trusted,
      footTravel,
      heightSpread: Math.max(...heights) - Math.min(...heights),
      residual: Math.max(...result.residuals) * 1000,
      churnOff: result.churnWithout.churn * 100,
      churnOn: result.churnWith.churn * 100,
      loopCost: loopCost === null ? null : loopCost * 100,
      loopEnd: loopEnd === null ? null : loopEnd * 100,
      kept: kept.length,
    });
    console.log(`processed ${id}`);
  }
}

writeFileSync('out-wide/results.json', `${JSON.stringify(rows, null, 2)}\n`);
console.log('');
console.log('character-action     canvas    CUT     grounded  foot  resid  churn off->on   loop');
for (const r of rows) {
  const cut = r.clipped > 0 ? `${r.clipped}/${r.sampled}` : '-';
  console.log(
    `${r.id.padEnd(20)} ${r.canvas.padEnd(9)} ${cut.padEnd(7)} ${r.grounded.padEnd(9)} ` +
    `${r.footTravel.toFixed(1).padStart(4)} ` +
    `${r.residual.toFixed(1).padStart(6)} ` +
    `${r.churnOff.toFixed(1).padStart(6)}->${r.churnOn.toFixed(1).padStart(5)}  ` +
    `${r.loopCost === null ? '' : `${r.loopCost.toFixed(0)}% (end ${r.loopEnd.toFixed(0)}%)`}`,
  );
}
const cutRuns = rows.filter((r) => r.clipped > 0);
console.log('');
console.log(`${cutRuns.length} of ${rows.length} animations have frames cut off at the edge of the source.`);
console.log('Those frames cannot be repaired downstream — the drawing is already missing.');
