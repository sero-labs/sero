import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decodePng(buf) {
  let off = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      const x = line[i];
      let v;
      if (filter === 0) v = x; else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b; else if (filter === 3) v = x + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
             v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

const { width, height, channels, data } = decodePng(readFileSync(process.argv[2]));
const at = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2]]; };
const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);

// Character box only: the background is a drawn white/grey checkerboard.
const isBg = (p) => p[0] > 195 && p[1] > 195 && p[2] > 195 && Math.max(...p) - Math.min(...p) < 14;
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!isBg(at(x, y))) {
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}

// Strong colour edges inside the character, horizontally and vertically.
const edgesX = [], edgesY = [];
for (let y = minY; y <= maxY; y++)
  for (let x = minX + 1; x <= maxX; x++)
    if (dist(at(x, y), at(x - 1, y)) > 60) edgesX.push(x);
for (let x = minX; x <= maxX; x++)
  for (let y = minY + 1; y <= maxY; y++)
    if (dist(at(x, y), at(x, y - 1)) > 60) edgesY.push(y);

// If the art sits on a grid of size b, edges land on multiples of b (plus an offset).
function alignment(edges, b) {
  let best = 0;
  for (let phase = 0; phase < b; phase++) {
    let hits = 0;
    for (const e of edges) if ((e - phase) % b === 0) hits++;
    if (hits > best) best = hits;
  }
  return { score: best / edges.length, expected: 1 / b };
}

console.log(`character box   ${maxX - minX + 1} x ${maxY - minY + 1} file pixels`);
console.log(`edges found     ${edgesX.length} across, ${edgesY.length} down`);
console.log('');
console.log(' b   across          down            (lift = how much better than chance)');
for (let b = 2; b <= 20; b++) {
  const ax = alignment(edgesX, b), ay = alignment(edgesY, b);
  const liftX = ax.score / ax.expected, liftY = ay.score / ay.expected;
  const mark = liftX > 1.8 && liftY > 1.8 ? '  <== grid' : '';
  console.log(
    `${String(b).padStart(2)}   ${(ax.score * 100).toFixed(1).padStart(5)}% x${liftX.toFixed(2)}   ` +
    `${(ay.score * 100).toFixed(1).padStart(5)}% x${liftY.toFixed(2)}${mark}`,
  );
}
