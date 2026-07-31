/**
 * node run-grok.mjs
 *
 * Every clip of the wider test through the finished pipeline, and one table.
 *
 * Walks are cut at their true cycle, found by matching the animation against
 * itself. Jumps use the tall plate scale. Everything else is the same code.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scaleUp } from './png.mjs';
import { processAnimation } from './sprite2.mjs';

const SAMPLE_FPS = 12;
const KEEP = { walk: 10, jump: 10, death: 10 };

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

const plates = JSON.parse(readFileSync('characters/manifest.json', 'utf8'));
const jumpPlates = JSON.parse(readFileSync('characters/manifest-jump.json', 'utf8'));
const jumpScale = new Map(jumpPlates.map((c) => [c.id, c.jumpScale]));
mkdirSync('out-grok', { recursive: true });
const rows = [];

for (const character of plates) {
  const palette = paletteOf(character.sprite);
  for (const action of ['walk', 'jump', 'death']) {
    const id = `${character.id}-${action}`;
    const clip = `grokwide/${id}.mp4`;
    if (!existsSync(clip)) { console.log(`missing ${id}`); continue; }

    const work = `work-grok/${id}`;
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-vf', `fps=${SAMPLE_FPS}`, `${work}/%03d.png`]);
    const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort().map((f) => `${work}/${f}`);

    const scale = action === 'jump' ? jumpScale.get(character.id) : character.scale;
    const result = processAnimation(files, { palette, referenceScale: scale });
    const { cols, rows: h } = result;
    let frames = result.frames;

    const difference = (a, b) => {
      let best = 1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          let differ = 0, union = 0;
          for (let y = 0; y < h; y++)
            for (let x = 0; x < cols; x++) {
              const sy = y + dy, sx = x + dx;
              const p = a[y * cols + x];
              const q = sy >= 0 && sx >= 0 && sy < h && sx < cols ? b[sy * cols + sx] : -1;
              if (p < 0 && q < 0) continue;
              union++;
              if (p !== q) differ++;
            }
          if (union > 0 && differ / union < best) best = differ / union;
        }
      return best;
    };

    // A walk is cut at the length where it repeats itself, not at the clip end.
    let cycle = null;
    if (action === 'walk') {
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
      cycle = { ...best, start: start.frame, join: start.cost };
      frames = frames.slice(start.frame, start.frame + best.period);
    }

    // Thinning: endpoints and reach extremes, then whatever is represented worst.
    const reach = frames.map((cells) => {
      let far = 0;
      for (let y = 0; y < h; y++)
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
    const kept = [...keep].sort((x, y) => x - y);
    while (kept.length < Math.min(KEEP[action], frames.length)) {
      let worst = -1, cost = -1;
      for (let i = 0; i < frames.length; i++) {
        if (kept.includes(i)) continue;
        const near = kept.reduce((b, k) => (Math.abs(k - i) < Math.abs(b - i) ? k : b), kept[0]);
        const c = difference(frames[i], frames[near]);
        if (c > cost) { cost = c; worst = i; }
      }
      if (worst < 0 || cost <= 0) break;
      kept.push(worst); kept.sort((x, y) => x - y);
    }

    mkdirSync(`out-grok/${id}`, { recursive: true });
    const toRgba = (cells) => {
      const buf = Buffer.alloc(cols * h * 4);
      for (let i = 0; i < cols * h; i++) {
        if (cells[i] < 0) continue;
        const c = palette[cells[i]];
        buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2]; buf[i * 4 + 3] = 255;
      }
      return buf;
    };
    const width = cols * kept.length;
    const sheet = Buffer.alloc(width * h * 4);
    kept.forEach((frame, index) => {
      const rgba = toRgba(frames[frame]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < cols; x++) {
          const s = (y * cols + x) * 4, d = (y * width + index * cols + x) * 4;
          sheet[d] = rgba[s]; sheet[d + 1] = rgba[s + 1]; sheet[d + 2] = rgba[s + 2]; sheet[d + 3] = rgba[s + 3];
        }
      const one = scaleUp({ width: cols, height: h, rgba }, 3);
      writeFileSync(`out-grok/${id}/frame-${String(index).padStart(2, '0')}-3x.png`, encodePng(one.width, one.height, one.rgba));
    });
    writeFileSync(`out-grok/${id}/sheet.png`, encodePng(width, h, sheet));
    const view = Math.max(1, Math.min(3, Math.floor(1700 / Math.max(width, 1))));
    const big = scaleUp({ width, height: h, rgba: sheet }, view);
    writeFileSync(`out-grok/${id}/sheet-${view}x.png`, encodePng(big.width, big.height, big.rgba));

    rows.push({
      id, action,
      canvas: `${cols}x${h}`,
      cut: result.measures.filter((m) => m.clipped).length,
      sampled: result.measures.length,
      grounded: result.grounded.filter((g) => g).length,
      footTravel: Math.max(...result.footHeights) - Math.min(...result.footHeights),
      residual: Math.max(...result.residuals) * 1000,
      churnOff: result.churnWithout.churn * 100,
      churnOn: result.churnWith.churn * 100,
      cycle,
      kept: kept.length,
    });
    console.log(`processed ${id}`);
  }
}

writeFileSync('out-grok/results.json', `${JSON.stringify(rows, null, 2)}\n`);
console.log('');
console.log('animation          canvas     cut     grounded  foot   resid  churn off->on   cycle');
for (const r of rows)
  console.log(
    `${r.id.padEnd(18)} ${r.canvas.padEnd(10)} ${(r.cut > 0 ? `${r.cut}/${r.sampled}` : '-').padEnd(7)} ` +
    `${`${r.grounded}/${r.sampled}`.padEnd(9)} ${r.footTravel.toFixed(1).padStart(5)} ` +
    `${r.residual.toFixed(1).padStart(6)} ${r.churnOff.toFixed(1).padStart(5)}->${r.churnOn.toFixed(1).padStart(4)}   ` +
    `${r.cycle ? `${r.cycle.period}f join ${(r.cycle.join * 100).toFixed(0)}%` : ''}`,
  );
const cut = rows.filter((r) => r.cut > 0);
console.log('');
console.log(`${cut.length} of ${rows.length} animations have frames cut off at the source edge` +
  `${cut.length ? `: ${cut.map((r) => r.id).join(', ')}` : ''}`);
