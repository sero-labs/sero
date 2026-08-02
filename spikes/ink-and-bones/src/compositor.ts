/**
 * Ink & Bones — evaluate, composite at SSx, then GRADE down to the pixel
 * grid. Direct port of art/compositor.gd.
 *
 * The grade pass is where "hand-painted" is reconciled with "pixel art":
 *   1. box-downsample SSx -> 1x
 *   2. quantize each pixel to the RAMP of the part that owns it
 *   3. despeckle to a fixpoint (emissives exempt)
 *   4. one 1px INK silhouette, LAST
 */

import { settleChains, simulateChains } from './chains';
import type { Color } from './img';
import { Img, sameColor } from './img';
import { Paint } from './paint';
import type { Pose, Skeleton } from './skeleton';
import type { Motion } from './motion';
import type { Affine, Vec } from './vec';
import { apply, inverse } from './vec';

export { settleChains, simulateChains };

export const SS = 4;
/** Coverage below which a 1x cell stays transparent. */
const COVER = 0.42;

export interface RigidPart {
  name: string;
  bone: string;
  paint: Paint;
  ramp: readonly Color[];
}

export interface ChainPart {
  name: string;
  chain: string;
  painter: (paint: Paint, points: readonly Vec[]) => void;
  ramp: readonly Color[];
}

export type Part = RigidPart | ChainPart;

export interface Shadow {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface GradeConfig {
  ink: Color;
  shadow: Color;
  /** Colours legal as a single pixel — hot emissive cores. */
  emissiveLone: readonly Color[];
}

/** Bake every frame of `clip` onto a 1x canvas of `w1x` x `h1x`. */
export function bake(
  skel: Skeleton,
  parts: readonly Part[],
  clip: Motion,
  w1x: number,
  h1x: number,
  cfg: GradeConfig,
  shadow?: Shadow,
): Img[] {
  const n = Math.max(1, Math.round(clip.cycle * clip.bakeFps));
  const chainFrames = simulateChains(skel, clip, n);
  const out: Img[] = [];
  for (let f = 0; f < n; f++) {
    const t = f / clip.bakeFps;
    const pose = clip.poseAt(t, skel);
    const chains = new Map<string, Vec[]>();
    for (const [name, frames] of chainFrames) chains.set(name, frames[f]);
    out.push(renderPose(skel, parts, pose, w1x, h1x, cfg, shadow, chains, clip.zOffsets(t)));
  }
  return out;
}

/** The rest frame: chains settled under gravity, skeleton held at `pose`. */
export function renderRest(
  skel: Skeleton,
  parts: readonly Part[],
  pose: Pose,
  w1x: number,
  h1x: number,
  cfg: GradeConfig,
  shadow?: Shadow,
): Img {
  return renderPose(skel, parts, pose, w1x, h1x, cfg, shadow, settleChains(skel, pose));
}

/** One graded 1x frame. */
export function renderPose(
  skel: Skeleton,
  parts: readonly Part[],
  pose: Pose,
  w1x: number,
  h1x: number,
  cfg: GradeConfig,
  shadow?: Shadow,
  chains: Map<string, Vec[]> = new Map(),
  z: Map<string, number> = new Map(),
): Img {
  const w = w1x * SS;
  const h = h1x * SS;
  const big = new Img(w, h);
  const owner = new Int32Array(w * h).fill(-1);

  const xfs = skel.transforms(pose);
  let order = parts.map((_, i) => i);
  if (z.size > 0) {
    order = order
      .map((i) => [i + (z.get(parts[i].name) ?? 0), i] as const)
      .sort((a, b) => a[0] - b[0])
      .map((pair) => pair[1]);
  }
  for (const i of order) {
    const part = parts[i];
    if ('chain' in part) {
      const pts = chains.get(part.chain);
      if (pts === undefined || pts.length === 0) continue;
      splat(big, owner, i, chainPaint(part, pts), { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    } else {
      const xf = xfs.get(part.bone);
      if (xf === undefined) {
        throw new Error(`compositor: part '${part.name}' binds unknown bone '${part.bone}'`);
      }
      splat(big, owner, i, part.paint, xf);
    }
  }

  const body = grade(big, owner, parts, w1x, h1x, cfg);
  outline(body, cfg.ink);

  const img = new Img(w1x, h1x);
  if (shadow !== undefined) {
    discEllipse(img, shadow.x, shadow.y, shadow.rx, shadow.ry, cfg.shadow);
  }
  img.blendImage(body);
  return img;
}

function discEllipse(img: Img, cx: number, cy: number, rx: number, ry: number, c: Color): void {
  for (let y = Math.max(0, cy - ry); y <= Math.min(img.h - 1, cy + ry); y++) {
    for (let x = Math.max(0, cx - rx); x <= Math.min(img.w - 1, cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / (ry + 0.001);
      if (nx * nx + ny * ny <= 1) img.blend(x, y, c);
    }
  }
}

/** Paint a chain part into a canvas-space Paint spanning the points' bounds. */
function chainPaint(part: ChainPart, pts: readonly Vec[]): Paint {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of pts) {
    minX = Math.min(minX, pt[0]);
    minY = Math.min(minY, pt[1]);
    maxX = Math.max(maxX, pt[0]);
    maxY = Math.max(maxY, pt[1]);
  }
  const margin = 14;
  const paint = new Paint({
    x: Math.floor(minX - margin),
    y: Math.floor(minY - margin),
    w: Math.ceil(maxX - minX + margin * 2),
    h: Math.ceil(maxY - minY + margin * 2),
  });
  part.painter(paint, pts);
  return paint;
}

// --- composite --------------------------------------------------------------

/** Draw one part's painted canvas into the ss composite through its bone
 * transform, sampling bilinearly. Pixels more than half opaque record the
 * part index for the grade pass. */
function splat(big: Img, owner: Int32Array, index: number, paint: Paint, xf: Affine): void {
  const src = paint.img;
  const sw = src.w;
  const sh = src.h;
  const org = paint.origin;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of [
    [0, 0],
    [sw, 0],
    [0, sh],
    [sw, sh],
  ] as const) {
    const p = apply(xf, [corner[0] - org[0], corner[1] - org[1]]);
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const x0 = Math.max(0, Math.floor(minX) - 1);
  const y0 = Math.max(0, Math.floor(minY) - 1);
  const x1 = Math.min(big.w - 1, Math.ceil(maxX) + 1);
  const y1 = Math.min(big.h - 1, Math.ceil(maxY) + 1);

  const inv = inverse(xf);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const local = apply(inv, [x + 0.5, y + 0.5]);
      const sx = local[0] + org[0] - 0.5;
      const sy = local[1] + org[1] - 0.5;
      if (sx < -1 || sy < -1 || sx > sw || sy > sh) continue;
      const c = bilinear(src, sx, sy);
      if (c[3] < 0.02) continue;
      big.blend(x, y, c);
      if (c[3] > 0.5) owner[y * big.w + x] = index;
    }
  }
}

function bilinear(src: Img, sx: number, sy: number): Color {
  const fx = Math.floor(sx);
  const fy = Math.floor(sy);
  const tx = sx - fx;
  const ty = sy - fy;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let oy = 0; oy < 2; oy++) {
    for (let ox = 0; ox < 2; ox++) {
      const px = fx + ox;
      const py = fy + oy;
      if (!src.inside(px, py)) continue;
      const s = src.get(px, py);
      const w = (ox === 1 ? tx : 1 - tx) * (oy === 1 ? ty : 1 - ty);
      r += s[0] * s[3] * w;
      g += s[1] * s[3] * w;
      b += s[2] * s[3] * w;
      a += s[3] * w;
    }
  }
  if (a > 0.001) return [r / a, g / a, b / a, a];
  return [0, 0, 0, 0];
}

// --- grade ------------------------------------------------------------------

function grade(
  big: Img,
  owner: Int32Array,
  parts: readonly Part[],
  w1x: number,
  h1x: number,
  cfg: GradeConfig,
): Img {
  const out = new Img(w1x, h1x);
  for (let cy = 0; cy < h1x; cy++) {
    for (let cx = 0; cx < w1x; cx++) {
      let aSum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      const votes = new Map<number, number>();
      const hot = new Map<number, number>();
      for (let oy = 0; oy < SS; oy++) {
        for (let ox = 0; ox < SS; ox++) {
          const x = cx * SS + ox;
          const y = cy * SS + oy;
          const c = big.get(x, y);
          aSum += c[3];
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          const id = owner[y * big.w + x];
          if (id >= 0) {
            votes.set(id, (votes.get(id) ?? 0) + 1);
            for (let e = 0; e < cfg.emissiveLone.length; e++) {
              if (sameColor(c, cfg.emissiveLone[e])) hot.set(e, (hot.get(e) ?? 0) + 1);
            }
          }
        }
      }
      if (aSum / (SS * SS) < COVER || votes.size === 0) continue;
      // Emissives win the cell outright at ~1/3 coverage — the accent IS the
      // art; a 1px visor core must never be averaged into the suit around it.
      let hotBest = -1;
      let hotN = 0;
      for (const [e, n] of hot) {
        if (n > hotN) {
          hotN = n;
          hotBest = e;
        }
      }
      if (hotBest >= 0 && hotN >= 4) {
        out.set(cx, cy, cfg.emissiveLone[hotBest]);
        continue;
      }
      let best = -1;
      let bestN = 0;
      for (const [id, n] of votes) {
        if (n > bestN) {
          bestN = n;
          best = id;
        }
      }
      const mean: Color = [r / aSum, g / aSum, b / aSum, 1];
      out.set(cx, cy, quantize(mean, parts[best].ramp));
    }
  }
  despeckle(out, cfg.emissiveLone);
  return out;
}

function quantize(c: Color, ramp: readonly Color[]): Color {
  let best = ramp[0];
  let bestD = Infinity;
  for (const rc of ramp) {
    const dr = c[0] - rc[0];
    const dg = c[1] - rc[1];
    const db = c[2] - rc[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = rc;
    }
  }
  return best;
}

/** A pixel with no same-color neighbour snaps to its most common opaque
 * 4-neighbour (or clears) — "cluster detail pixels", mechanically. Runs to a
 * fixpoint with immediate application, so paired speckles cannot oscillate. */
function despeckle(img: Img, keep: readonly Color[]): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const c = img.get(x, y);
        if (c[3] < 0.5) continue;
        if (keep.some((k) => sameColor(c, k))) continue;
        const votes: { c: Color; n: number }[] = [];
        let same = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!img.inside(nx, ny)) continue;
            const n = img.get(nx, ny);
            if (n[3] < 0.5) continue;
            if (sameColor(n, c)) {
              same = true;
            } else if (Math.abs(dx) + Math.abs(dy) === 1) {
              const found = votes.find((v) => sameColor(v.c, n));
              if (found) found.n++;
              else votes.push({ c: n, n: 1 });
            }
          }
        }
        if (same) continue;
        let best: Color | null = null;
        let bestN = 0;
        for (const v of votes) {
          if (v.n > bestN) {
            bestN = v.n;
            best = v.c;
          }
        }
        img.set(x, y, best ?? [0, 0, 0, 0]);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** 1px INK ring written into transparent 4-neighbours — the silhouette law. */
function outline(img: Img, ink: Color): void {
  const edge = new Set<number>();
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.alpha(x, y) < 0.5) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (img.inside(nx, ny) && img.alpha(nx, ny) < 0.5) edge.add(ny * img.w + nx);
      }
    }
  }
  for (const i of edge) img.set(i % img.w, Math.floor(i / img.w), ink);
}
