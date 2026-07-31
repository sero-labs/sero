/**
 * The deterministic stage, revision 2 — the version the reviews asked for.
 *
 * What changed from sprite.mjs:
 *  D25  the source holds the arc; only the drift is corrected
 *  D26  alignment is measured from silhouette and brightness, before colour
 *  D20  quantising carries memory, so cells stop flipping between shades
 *  D27  colour fidelity is checked by ramp usage, not by region
 *
 * Still no AI anywhere in this file.
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';
import { buildRamps, rampIndex, rampUsage, rampDrift, oklab, labDistance } from './colour.mjs';

const MAGENTA = [255, 0, 255];

// ---------------------------------------------------------------- source side

function keyMask(img) {
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) {
    const r = img.rgba[i * 4], g = img.rgba[i * 4 + 1], b = img.rgba[i * 4 + 2];
    mask[i] =
      Math.abs(r - MAGENTA[0]) + Math.abs(g - MAGENTA[1]) + Math.abs(b - MAGENTA[2]) < 90 ||
      (r > 150 && b > 150 && g < 90 && Math.abs(r - b) < 70)
        ? 1 : 0;
  }
  return keepLargestBody(mask, img.width, img.height);
}

/**
 * Keep the character and drop everything else the key let through.
 *
 * Grok draws a soft shadow on the ground under the character, despite being
 * told not to. It is washed-out magenta — far enough from the key colour to
 * survive it, and detached from the body. Left in, it becomes the lowest part
 * of the "silhouette", so the foot line stops moving and a jump measures as
 * nothing. It also inflates the canvas.
 *
 * A character is one connected mass. Anything not joined to it is not the
 * character, so the largest connected region wins and the rest goes back to
 * background.
 */
function keepLargestBody(mask, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  const sizes = [];
  const queue = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || label[start] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const at = queue[head++];
      size++;
      const x = at % width, y = (at - x) / width;
      if (x > 0) { const n = at - 1; if (!mask[n] && label[n] < 0) { label[n] = id; queue[tail++] = n; } }
      if (x < width - 1) { const n = at + 1; if (!mask[n] && label[n] < 0) { label[n] = id; queue[tail++] = n; } }
      if (y > 0) { const n = at - width; if (!mask[n] && label[n] < 0) { label[n] = id; queue[tail++] = n; } }
      if (y < height - 1) { const n = at + width; if (!mask[n] && label[n] < 0) { label[n] = id; queue[tail++] = n; } }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return mask;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = label[i] === best ? 0 : 1;
  return out;
}

/** Silhouette box and foot position, in source pixels. */
function measure(img, mask) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (!mask[y * img.width + x]) {
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  if (maxY < 0) return null;
  // The one fault nothing downstream can repair: the drawing itself is cut off
  // at the edge of the picture it was drawn in.
  const clipped = minX <= 1 || minY <= 1 || maxX >= img.width - 2 || maxY >= img.height - 2;

  // The feet are the lowest *solid* part of the character, not the lowest pixel.
  //
  // The knight holds a sword that hangs below his tucked feet in the air. Taking
  // the lowest pixel makes the sword tip the foot line, so a jump of 75 pixels
  // measured as 8. A row has to carry real width to count as standing on
  // something; a blade tip never does.
  const bodyWidth = maxX - minX + 1;
  const solid = Math.max(3, Math.round(bodyWidth * 0.12));
  let footRow = maxY;
  for (let y = maxY; y >= minY; y--) {
    let count = 0;
    for (let x = minX; x <= maxX; x++) if (!mask[y * img.width + x]) count++;
    if (count >= solid) { footRow = y; break; }
  }

  const bandTop = Math.max(minY, footRow - Math.round((footRow - minY + 1) * 0.06));
  let sum = 0, n = 0;
  for (let y = bandTop; y <= footRow; y++)
    for (let x = minX; x <= maxX; x++)
      if (!mask[y * img.width + x]) { sum += x; n++; }
  return {
    minX, minY, maxX, maxY, count, clipped,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    footY: footRow + 1,
    footX: n > 0 ? sum / n : (minX + maxX) / 2,
  };
}

/**
 * Which frames have their feet on the ground.
 *
 * The lowest foot position an animation reaches is its ground. Anything close to
 * it is standing on it; anything well above it is in the air. In the product the
 * AI declares this and the runtime checks the declaration — here it is detected,
 * so the check itself can be measured.
 */
function detectGrounded(frames, scale, tolerance = 2) {
  const lowest = Math.max(...frames.map((f) => f.measure.footY));
  return frames.map((f) => lowest - f.measure.footY <= tolerance * scale);
}

/**
 * The per-frame correction (D25).
 *
 * NOT the position. The position comes from a single reference point that is
 * the same for every frame, so a character drawn higher up the picture stays
 * higher up — that is the jump. The correction only removes the drift the video
 * model adds, and it is interpolated across frames whose feet are legitimately
 * off the ground.
 */
function corrections(frames, grounded) {
  const anchorFrames = frames.filter((_, i) => grounded[i]);
  const source = anchorFrames.length > 0 ? anchorFrames : frames;
  const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  const reference = {
    y: median(source.map((f) => f.measure.footY)),
    x: median(source.map((f) => f.measure.footX)),
  };

  const known = frames.map((f, i) =>
    anchorFrames.length > 0 && grounded[i]
      ? { x: f.measure.footX - reference.x, y: f.measure.footY - reference.y }
      : null,
  );

  // An animation with no frame on the ground gets no correction at all.
  if (anchorFrames.length === 0) {
    return { reference, corrections: frames.map(() => ({ x: 0, y: 0 })), interpolated: 0, trusted: true };
  }

  let interpolated = 0;
  const out = known.map((value, i) => {
    if (value) return value;
    interpolated++;
    let before = -1, after = -1;
    for (let j = i - 1; j >= 0; j--) if (known[j]) { before = j; break; }
    for (let j = i + 1; j < known.length; j++) if (known[j]) { after = j; break; }
    if (before < 0 && after < 0) return { x: 0, y: 0 };
    if (before < 0) return { ...known[after] };
    if (after < 0) return { ...known[before] };
    const t = (i - before) / (after - before);
    return {
      x: known[before].x + (known[after].x - known[before].x) * t,
      y: known[before].y + (known[after].y - known[before].y) * t,
    };
  });
  return { reference, corrections: out, interpolated, trusted: false };
}

// ------------------------------------------------------------- the art grid

/** Mean foreground colour and coverage per art cell. No palette decision yet. */
function rawGrid(img, mask, scale, originX, originY, cols, rows) {
  const colour = new Float64Array(cols * rows * 3);
  const coverage = new Float64Array(cols * rows);
  for (let ry = 0; ry < rows; ry++)
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
      const at = ry * cols + rx;
      coverage[at] = total > 0 ? fg / total : 0;
      if (fg > 0) {
        colour[at * 3] = r / fg; colour[at * 3 + 1] = g / fg; colour[at * 3 + 2] = b / fg;
      }
    }
  return { colour, coverage, cols, rows };
}

/**
 * The residual offset between two frames (D26).
 *
 * Measured on coverage and brightness — never on palette indexes, because the
 * palette decision is about to depend on this answer. Deriving it from
 * already-quantised cells would make each step wait for the other.
 */
function alignRaw(previous, current, radius = 2) {
  const { cols, rows } = current;
  const lum = (grid, at) =>
    0.299 * grid.colour[at * 3] + 0.587 * grid.colour[at * 3 + 1] + 0.114 * grid.colour[at * 3 + 2];
  let best = { dx: 0, dy: 0, cost: Infinity };
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      let cost = 0, n = 0;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const sy = y + dy, sx = x + dx;
          if (sy < 0 || sx < 0 || sy >= rows || sx >= cols) continue;
          const a = y * cols + x, b = sy * cols + sx;
          cost += Math.abs(current.coverage[a] - previous.coverage[b]) * 255;
          cost += Math.abs(lum(current, a) - lum(previous, b)) * 0.5;
          n++;
        }
      if (n > 0 && cost / n < best.cost) best = { dx, dy, cost: cost / n };
    }
  return best;
}

// --------------------------------------------------------------- quantising

function nearest(paletteLab, lab) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < paletteLab.length; i++) {
    const d = labDistance(paletteLab[i], lab);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: bestD };
}

/**
 * Quantise a sequence (D20).
 *
 * With `memory` off this is the old behaviour: every frame decided alone, which
 * is what makes a sprite boil. With it on, a cell keeps the entry it had unless
 * the new colour beats it by a margin — and only where the source barely moved,
 * because a limb that is genuinely swinging is supposed to change.
 */
export function quantiseSequence(grids, palette, {
  memory = true,
  // Measured on the explorer idle: 0.03 removes about two thirds of the churn
  // for about a tenth more colour residual. See the margin sweep.
  margin = 0.03,
  alphaMargin = 0.12,
  staticColour = 26,
} = {}) {
  const paletteLab = palette.map(oklab);
  const { cols, rows } = grids[0];
  const out = [];
  const offsets = [];
  const residuals = [];

  for (let f = 0; f < grids.length; f++) {
    let residualSum = 0, residualCount = 0;
    const grid = grids[f];
    const previous = f > 0 ? out[f - 1] : null;
    const offset = f > 0 ? alignRaw(grids[f - 1], grid) : { dx: 0, dy: 0 };
    offsets.push(offset);
    const cells = new Int32Array(cols * rows).fill(-1);

    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const at = y * cols + x;
        const coverage = grid.coverage[at];
        const sy = y + offset.dy, sx = x + offset.dx;
        const prevAt = sy >= 0 && sx >= 0 && sy < rows && sx < cols ? sy * cols + sx : -1;
        const prevIndex = memory && previous && prevAt >= 0 ? previous[prevAt] : -1;

        // How much the source itself moved here. Memory only applies where the
        // answer is "barely" — elsewhere the change is real and must show.
        let sourceMoved = Infinity;
        if (prevAt >= 0 && f > 0) {
          const a = grid.colour, b = grids[f - 1].colour;
          sourceMoved =
            Math.abs(a[at * 3] - b[prevAt * 3]) +
            Math.abs(a[at * 3 + 1] - b[prevAt * 3 + 1]) +
            Math.abs(a[at * 3 + 2] - b[prevAt * 3 + 2]) +
            Math.abs(grid.coverage[at] - grids[f - 1].coverage[prevAt]) * 255;
        }
        const steady = memory && sourceMoved < staticColour;

        // Alpha, with the same memory so edge cells stop flickering.
        let opaque;
        if (steady && prevIndex >= 0) opaque = coverage >= 0.5 - alphaMargin;
        else if (steady && prevIndex === -1) opaque = coverage >= 0.5 + alphaMargin;
        else opaque = coverage >= 0.5;
        if (!opaque) { cells[at] = -1; continue; }

        const lab = oklab([grid.colour[at * 3], grid.colour[at * 3 + 1], grid.colour[at * 3 + 2]]);
        const best = nearest(paletteLab, lab);
        if (steady && prevIndex >= 0) {
          const keepDistance = labDistance(paletteLab[prevIndex], lab);
          cells[at] = keepDistance - best.distance > margin ? best.index : prevIndex;
        } else {
          cells[at] = best.index;
        }
        // How far the drawing's own colour sat from the entry it was given.
        // This is the fidelity signal: it rises when the model relights the
        // character, and unlike ramp usage it does not care which parts are
        // visible in this pose.
        residualSum += labDistance(paletteLab[cells[at]], lab);
        residualCount++;
      }
    residuals.push(residualCount > 0 ? residualSum / residualCount : 0);
    out.push(cells);
  }
  return { frames: out, offsets, residuals };
}

// ------------------------------------------------------------------ measures

/**
 * Churn where nothing was happening — the number that catches boil.
 *
 * Only cells whose source barely changed are counted, so real movement cannot
 * flatter or spoil the score.
 */
export function staticChurn(grids, quantised, offsets, { staticColour = 26 } = {}) {
  const { cols, rows } = grids[0];
  let churned = 0, considered = 0;
  for (let f = 1; f < grids.length; f++) {
    const { dx, dy } = offsets[f];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const at = y * cols + x;
        const sy = y + dy, sx = x + dx;
        if (sy < 0 || sx < 0 || sy >= rows || sx >= cols) continue;
        const prevAt = sy * cols + sx;
        const a = grids[f].colour, b = grids[f - 1].colour;
        const moved =
          Math.abs(a[at * 3] - b[prevAt * 3]) +
          Math.abs(a[at * 3 + 1] - b[prevAt * 3 + 1]) +
          Math.abs(a[at * 3 + 2] - b[prevAt * 3 + 2]) +
          Math.abs(grids[f].coverage[at] - grids[f - 1].coverage[prevAt]) * 255;
        if (moved >= staticColour) continue;
        considered++;
        if (quantised[f][at] !== quantised[f - 1][prevAt]) churned++;
      }
  }
  return { churn: considered > 0 ? churned / considered : 0, considered };
}

/** How far the last frame is from the first, for an animation meant to loop. */
export function loopClosure(frames, cols, rows) {
  const first = frames[0], last = frames.at(-1);
  let best = 1;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      let differ = 0, union = 0;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const sy = y + dy, sx = x + dx;
          const a = first[y * cols + x];
          const b = sy >= 0 && sx >= 0 && sy < rows && sx < cols ? last[sy * cols + sx] : -1;
          if (a < 0 && b < 0) continue;
          union++;
          if (a !== b) differ++;
        }
      if (union > 0 && differ / union < best) best = differ / union;
    }
  return best;
}

// ------------------------------------------------------------- the whole run

export function processAnimation(files, { palette, referenceCanvas = 1024, referenceScale = 6, memory = true }) {
  const loaded = files.map((file) => {
    const img = decodePng(readFileSync(file));
    const mask = keyMask(img);
    return { file, img, mask, measure: measure(img, mask), scale: (img.width / referenceCanvas) * referenceScale };
  }).filter((f) => f.measure);

  const scale = loaded[0].scale;
  const grounded = detectGrounded(loaded, scale);
  const { reference, corrections: fix, interpolated, trusted } = corrections(loaded, grounded);

  // The canvas holds every frame's reach from the one fixed reference point.
  let above = 0, below = 0, left = 0, right = 0;
  loaded.forEach((f, i) => {
    const y = reference.y + fix[i].y, x = reference.x + fix[i].x;
    above = Math.max(above, (y - f.measure.minY) / scale);
    below = Math.max(below, (f.measure.maxY + 1 - y) / scale);
    left = Math.max(left, (x - f.measure.minX) / scale);
    right = Math.max(right, (f.measure.maxX + 1 - x) / scale);
  });
  const cols = Math.ceil(left + right) + 2;
  const rows = Math.ceil(above + below) + 2;
  const anchorCol = Math.ceil(left) + 1;
  const anchorRow = Math.ceil(above) + 1;

  const grids = loaded.map((f, i) => {
    // One reference point for the whole animation, minus this frame's drift.
    // The character's own height in the picture is left exactly as drawn.
    const originX = reference.x + fix[i].x - anchorCol * scale;
    const originY = reference.y + fix[i].y - anchorRow * scale;
    return rawGrid(f.img, f.mask, scale, originX, originY, cols, rows);
  });

  const withMemory = quantiseSequence(grids, palette, { memory });
  const withoutMemory = quantiseSequence(grids, palette, { memory: false });

  const ramps = buildRamps(palette);
  const rampOf = rampIndex(ramps, palette.length);

  // Foot height per frame, in art pixels above the reference — this is the arc.
  const footHeights = loaded.map((f, i) =>
    (reference.y + fix[i].y - (f.measure.footY)) / scale);

  return {
    cols, rows, anchorCol, anchorRow, scale, ramps, rampOf,
    grounded, interpolated, trusted,
    frames: withMemory.frames,
    framesNoMemory: withoutMemory.frames,
    offsets: withMemory.offsets,
    residuals: withMemory.residuals,
    grids,
    measures: loaded.map((f) => f.measure),
    footHeights,
    churnWith: staticChurn(grids, withMemory.frames, withMemory.offsets),
    churnWithout: staticChurn(grids, withoutMemory.frames, withoutMemory.offsets),
    rampUsageOf: (cells) => rampUsage(cells, ramps, rampOf),
    rampDrift,
  };
}
