/**
 * node diag.mjs <workDir> <scale>
 *
 * Per-frame source measurements, to tell a real jump from a tucked pair of legs
 * — and to prove whether the drawing ever ran off the edge of its own frame.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const [work, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg);
const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort();

const isKey = (r, g, b) =>
  Math.abs(r - 255) + g + Math.abs(b - 255) < 90 || (r > 150 && b > 150 && g < 90 && Math.abs(r - b) < 70);

console.log('frame   headY   footY  height  touches edge');
const rows = [];
for (const [i, file] of files.entries()) {
  const img = decodePng(readFileSync(`${work}/${file}`));
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      if (isKey(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2])) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  const touches = minX <= 1 || minY <= 1 || maxX >= img.width - 2 || maxY >= img.height - 2;
  rows.push({ i, head: minY / scale, foot: (maxY + 1) / scale, height: (maxY - minY + 1) / scale, touches });
  if (i % 4 === 0 || touches)
    console.log(
      `  ${String(i).padStart(3)}  ${rows[i].head.toFixed(1).padStart(6)}  ${rows[i].foot.toFixed(1).padStart(6)}  ` +
      `${rows[i].height.toFixed(1).padStart(6)}  ${touches ? 'YES — drawing is cut' : ''}`,
    );
}
const feet = rows.map((r) => r.foot), heads = rows.map((r) => r.head), heights = rows.map((r) => r.height);
console.log('');
console.log(`foot line   ${Math.min(...feet).toFixed(1)} to ${Math.max(...feet).toFixed(1)}  (travel ${(Math.max(...feet) - Math.min(...feet)).toFixed(1)} art px)`);
console.log(`head line   ${Math.min(...heads).toFixed(1)} to ${Math.max(...heads).toFixed(1)}  (travel ${(Math.max(...heads) - Math.min(...heads)).toFixed(1)} art px)`);
console.log(`height      ${Math.min(...heights).toFixed(1)} to ${Math.max(...heights).toFixed(1)}`);
console.log(`frames cut  ${rows.filter((r) => r.touches).length} of ${rows.length}`);
console.log('');
console.log('A real jump moves the head and the feet together. If only the feet');
console.log('travel, the character tucked its legs and never left the ground.');
