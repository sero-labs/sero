/** node run-sequence.mjs <name> <frame.png ...> */
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng, scaleUp } from './png.mjs';
import { loadPalette, processSequence, toRgba, sheet } from './sprite.mjs';

const [name, ...files] = process.argv.slice(2);
if (!name || files.length === 0) throw new Error('usage: run-sequence.mjs <name> <frames...>');

const palette = loadPalette('art-1x.png');
const result = processSequence(files, { palette, artHeight: 136 });
const { cols, rows, frames } = result;

mkdirSync(`out/${name}`, { recursive: true });
frames.forEach((frame, i) => {
  const rgba = toRgba(frame.cells, cols, rows);
  const one = { width: cols, height: rows, rgba };
  writeFileSync(`out/${name}/frame-${String(i).padStart(2, '0')}.png`, encodePng(cols, rows, rgba));
  const big = scaleUp(one, 4);
  writeFileSync(`out/${name}/frame-${String(i).padStart(2, '0')}-4x.png`, encodePng(big.width, big.height, big.rgba));
});
const strip = sheet(frames, cols, rows);
writeFileSync(`out/${name}/sheet.png`, encodePng(strip.width, strip.height, strip.rgba));
const bigStrip = scaleUp(strip, 4);
writeFileSync(`out/${name}/sheet-4x.png`, encodePng(bigStrip.width, bigStrip.height, bigStrip.rgba));

const heights = frames.map((f) => f.artHeight);
const spread = Math.max(...heights) - Math.min(...heights);
const changes = frames.slice(1).map((f) => f.changeFromPrevious);

console.log(`== ${name} ==`);
console.log(`canvas       ${cols} x ${rows} art pixels, ${frames.length} frames`);
console.log('');
console.log('frame  height  off-palette  changed vs previous  drift left after anchoring');
frames.forEach((f, i) => {
  console.log(
    `  ${String(i).padStart(2)}   ` +
    `${f.artHeight.toFixed(1).padStart(5)}  ` +
    `${((f.offPalette / Math.max(f.drawn, 1)) * 100).toFixed(1).padStart(9)}%  ` +
    `${f.changeFromPrevious === undefined ? '            -' : `${(f.changeFromPrevious * 100).toFixed(1).padStart(12)}%`}  ` +
    `${f.residualDrift ? `${f.residualDrift[0]},${f.residualDrift[1]} px`.padStart(20) : ''}`,
  );
});
console.log('');
console.log(`height spread   ${spread.toFixed(1)} art pixels  (0 is perfect, over 4 is visible)`);
if (changes.length)
  console.log(`change per step ${(Math.min(...changes) * 100).toFixed(1)}% to ${(Math.max(...changes) * 100).toFixed(1)}%`);
console.log(`written         out/${name}/sheet-4x.png`);
