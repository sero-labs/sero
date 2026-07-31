/**
 * The deterministic stage, shared by both spikes.
 *
 * Drawn frames in, one clean sprite sequence out: keyed, measured, resampled to
 * the art grid, snapped to the locked palette, and anchored to a common canvas.
 * It also reports what the drawing stage got wrong, which is the whole point of
 * the spike. No AI in this file.
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const MAGENTA = [255, 0, 255];

/** True where the pixel is the flat key colour, or mostly it. */
function keyMask(img, tolerance = 90) {
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) {
    const r = img.rgba[i * 4], g = img.rgba[i * 4 + 1], b = img.rgba[i * 4 + 2];
    // Magenta is high red, high blue, low green. Nothing on the character is.
    const isKey =
      Math.abs(r - MAGENTA[0]) + Math.abs(g - MAGENTA[1]) + Math.abs(b - MAGENTA[2]) < tolerance ||
      (r > 150 && b > 150 && g < 90 && Math.abs(r - b) < 70);
    mask[i] = isKey ? 1 : 0;
  }
  return mask;
}

function bounds(img, mask) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (!mask[y * img.width + x]) {
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, minY, maxX, maxY, count, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The foot line and the centre of the feet.
 *
 * Anchoring on the bottom of the silhouette keeps him planted. Anchoring on the
 * middle of the whole box would make him slide whenever an arm reaches out.
 */
function anchor(img, mask, box) {
  const bandTop = Math.max(box.minY, box.maxY - Math.round(box.height * 0.06));
  let sum = 0, n = 0;
  for (let y = bandTop; y <= box.maxY; y++)
    for (let x = box.minX; x <= box.maxX; x++)
      if (!mask[y * img.width + x]) { sum += x; n++; }
  return { x: n > 0 ? sum / n : (box.minX + box.maxX) / 2, y: box.maxY + 1 };
}

/** Average each art cell over foreground pixels only, so the key never bleeds in. */
function resample(img, mask, scale, originX, originY, cols, rows) {
  const cells = [];
  for (let ry = 0; ry < rows; ry++) {
    const row = [];
    for (let rx = 0; rx < cols; rx++) {
      const x0 = originX + rx * scale, y0 = originY + ry * scale;
      let r = 0, g = 0, b = 0, fg = 0, total = 0;
      for (let y = Math.floor(y0); y < Math.floor(y0 + scale); y++)
        for (let x = Math.floor(x0); x < Math.floor(x0 + scale); x++) {
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) { total++; continue; }
          total++;
          if (mask[y * img.width + x]) continue;
          const i = (y * img.width + x) * 4;
          r += img.rgba[i]; g += img.rgba[i + 1]; b += img.rgba[i + 2]; fg++;
        }
      row.push(total > 0 && fg / total >= 0.5 ? [r / fg, g / fg, b / fg] : null);
    }
    cells.push(row);
  }
  return cells;
}

export function loadPalette(path) {
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

function snap(palette, c) {
  let best = palette[0], bestD = Infinity;
  for (const p of palette) {
    const d = 2 * (p[0] - c[0]) ** 2 + 4 * (p[1] - c[1]) ** 2 + 3 * (p[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return { colour: best, distance: Math.sqrt(bestD) };
}

/**
 * Process one sequence.
 *
 * `scale` is fixed for the whole sequence and comes from how the input was
 * built, never from each frame. A model that draws the character bigger must
 * show up as a bigger sprite, because that is the drift being measured.
 */
export function processSequence(files, { palette, artHeight, referenceCanvas = 1024, referenceScale = 6 }) {
  const loaded = files.map((file) => {
    const img = decodePng(readFileSync(file));
    const mask = keyMask(img);
    const box = bounds(img, mask);
    const scale = (img.width / referenceCanvas) * referenceScale;
    return { file, img, mask, box, scale, anchor: anchor(img, mask, box) };
  });

  // A canvas that fits every pose, with the feet on a common line.
  let above = 0, below = 0, left = 0, right = 0;
  for (const f of loaded) {
    above = Math.max(above, (f.anchor.y - f.box.minY) / f.scale);
    below = Math.max(below, (f.box.maxY + 1 - f.anchor.y) / f.scale);
    left = Math.max(left, (f.anchor.x - f.box.minX) / f.scale);
    right = Math.max(right, (f.box.maxX + 1 - f.anchor.x) / f.scale);
  }
  const cols = Math.ceil(left + right) + 2;
  const rows = Math.ceil(above + below) + 2;
  const anchorCol = Math.ceil(left) + 1;
  const anchorRow = Math.ceil(above) + 1;

  const frames = loaded.map((f) => {
    const originX = f.anchor.x - anchorCol * f.scale;
    const originY = f.anchor.y - anchorRow * f.scale;
    const raw = resample(f.img, f.mask, f.scale, originX, originY, cols, rows);
    let offPalette = 0, drawn = 0, drift = 0;
    const cells = raw.map((row) => row.map((c) => {
      if (!c) return null;
      drawn++;
      const { colour, distance } = snap(palette, c);
      drift += distance;
      if (distance > 40) offPalette++;
      return colour;
    }));
    return {
      file: f.file,
      cells,
      artHeight: f.box.height / f.scale,
      artWidth: f.box.width / f.scale,
      drawn,
      offPalette,
      colourDrift: drawn > 0 ? drift / drawn : 0,
      sourceSize: `${f.img.width}x${f.img.height}`,
    };
  });

  // How much of the sprite changes from one frame to the next.
  //
  // Measured at the best alignment, not where the frames happen to land. A
  // sprite shifted by one pixel differs everywhere, and calling that "the whole
  // character was redrawn" would hide the thing worth knowing. The offset that
  // wins is itself the answer to "how far did he drift after anchoring".
  const difference = (a, b, dx, dy) => {
    let changed = 0, union = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const sy = y + dy, sx = x + dx;
        const q = sy >= 0 && sy < rows && sx >= 0 && sx < cols ? b[sy][sx] : null;
        const p = a[y][x];
        if (!p && !q) continue;
        union++;
        if (!p || !q || p.join() !== q.join()) changed++;
      }
    return union > 0 ? changed / union : 0;
  };
  for (let i = 1; i < frames.length; i++) {
    let best = Infinity, bestOffset = [0, 0];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = difference(frames[i - 1].cells, frames[i].cells, dx, dy);
        if (d < best) { best = d; bestOffset = [dx, dy]; }
      }
    frames[i].changeFromPrevious = best;
    frames[i].residualDrift = bestOffset;
    frames[i].changeUnaligned = difference(frames[i - 1].cells, frames[i].cells, 0, 0);
  }

  return { cols, rows, anchorCol, anchorRow, frames, artHeight };
}

export function toRgba(cells, cols, rows) {
  const buf = Buffer.alloc(cols * rows * 4);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = cells[y][x];
      if (!c) continue;
      const o = (y * cols + x) * 4;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
    }
  return buf;
}

/** All frames side by side: the sprite sheet, and what you look at to judge it. */
export function sheet(frames, cols, rows) {
  const width = cols * frames.length;
  const buf = Buffer.alloc(width * rows * 4);
  frames.forEach((frame, index) => {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const c = frame.cells[y][x];
        if (!c) continue;
        const o = (y * width + index * cols + x) * 4;
        buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
      }
  });
  return { width, height: rows, rgba: buf };
}
