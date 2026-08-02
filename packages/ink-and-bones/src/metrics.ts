/**
 * Frame analysis shared by the audit gates and the test net, so the numbers
 * an authoring loop iterates against and the numbers enforcement uses cannot
 * drift apart. Ported from tools/anim_metrics.gd + tools/puppet_metrics.gd.
 *
 * Everything here answers one question: what goes wrong in a PROCEDURAL
 * animation that a still frame will not show you? A limb that detached, a
 * frame that never moved, a cycle that walks itself sideways, a colour that
 * escaped the grade — all structural, all measurable.
 */

import type { Color } from './img';
import { Img, sameColor } from './img';
import { colorKey } from './spec';

/** Pixels at or below this alpha are invisible to every metric — which is
 * what lets a soft ground shadow (alpha < 0.5) exist outside the vocabulary. */
const OPAQUE = 0.5;

export interface FrameStats {
  /** Opaque pixel count. */
  px: number;
  /** Opaque pixels that are the ink colour. */
  ink: number;
  /** Bounding box, or null when the frame is empty. */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Topmost and bottommost opaque rows (-1 when empty). */
  head: number;
  feet: number;
  /** Centroid x of the silhouette. */
  cx: number;
  /** Distinct exact colours present, as colorKey strings. */
  colors: Set<string>;
  /** 4-connected silhouette islands — anything but 1 is a detached piece. */
  islands: number;
}

/** The signature failure of pose-driven animation: a part offset far enough
 * that it separates from the body and floats. Only a connectivity count
 * catches this reliably. */
export function islands(img: Img): number {
  const { w, h } = img;
  const seen = new Uint8Array(w * h);
  let count = 0;
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (seen[i] === 1 || img.alpha(x, y) <= OPAQUE) continue;
      count++;
      seen[i] = 1;
      stack.push(i);
      while (stack.length > 0) {
        const p = stack.pop()!;
        const px = p % w;
        const py = Math.floor(p / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (seen[n] === 1 || img.alpha(nx, ny) <= OPAQUE) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  return count;
}

/** Fully transparent pixels sealed inside the silhouette: flood the outside
 * from the border, count what transparent area remains. They render as
 * unoutlined holes — the most common hand-fix in review. */
export function pocketPx(img: Img): number {
  const { w, h } = img;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside[i] === 1 || img.alpha(x, y) !== 0) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const px = p % w;
    const py = Math.floor(p / w);
    push(px + 1, py);
    push(px - 1, py);
    push(px, py + 1);
    push(px, py - 1);
  }
  let sealed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (img.alpha(x, y) === 0 && outside[y * w + x] === 0) sealed++;
    }
  }
  return sealed;
}

/** Silhouette shape and mass for one frame. */
export function stats(img: Img, ink: Color): FrameStats {
  const { w, h } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  let inkN = 0;
  let sumX = 0;
  const colors = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = img.get(x, y);
      if (c[3] <= OPAQUE) continue;
      count++;
      sumX += x;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      colors.add(colorKey(c));
      if (sameColor(c, ink)) inkN++;
    }
  }
  return {
    px: count,
    ink: inkN,
    bbox: x1 >= 0 ? { x0, y0, x1, y1 } : null,
    head: x1 >= 0 ? y0 : -1,
    feet: y1,
    cx: count > 0 ? sumX / count : 0,
    colors,
    islands: islands(img),
  };
}

/** Pixels that differ between two frames. A frame whose delta is zero is a
 * frame the animation never actually moved. */
export function changed(a: Img, b: Img): number {
  let n = 0;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const ca = a.get(x, y);
      const cb = b.get(x, y);
      if (!sameColor(ca, cb) || Math.abs(ca[3] - cb[3]) >= 1e-4) n++;
    }
  }
  return n;
}

/** A non-ink opaque pixel on the top row or either side column: a shape's
 * fill reached the boundary with no room for its outline, and reads as
 * cropped. The bottom row is exempt for ground contact. */
export function edgeFill(img: Img, ink: Color): { top: number; left: number; right: number } {
  const { w, h } = img;
  const isFill = (x: number, y: number): boolean => {
    const c = img.get(x, y);
    return c[3] > OPAQUE && !sameColor(c, ink);
  };
  const out = { top: 0, left: 0, right: 0 };
  for (let x = 0; x < w; x++) if (isFill(x, 0)) out.top++;
  for (let y = 0; y < h; y++) {
    if (isFill(0, y)) out.left++;
    if (isFill(w - 1, y)) out.right++;
  }
  return out;
}

/** Fill pixels with NO same-colour neighbour in their 8-neighbourhood. The
 * grade's despeckle pass should leave zero; any survivor is single-pixel
 * noise. `allowed` lists colours legal as lone pixels — hot emissive cores
 * are deliberately 1px. */
export function specklePx(img: Img, ink: Color, allowed: readonly Color[] = []): number {
  const { w, h } = img;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = img.get(x, y);
      if (c[3] <= OPAQUE || sameColor(c, ink)) continue;
      let lone = true;
      for (let dy = -1; dy <= 1 && lone; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!img.inside(nx, ny)) continue;
          if (sameColor(img.get(nx, ny), c)) {
            lone = false;
            break;
          }
        }
      }
      if (!lone) continue;
      if (!allowed.some((a) => sameColor(c, a))) n++;
    }
  }
  return n;
}

/** Opaque pixels whose colour is outside the vocabulary. The per-part ramp
 * quantize should make this impossible; any hit is a colour that bled
 * through the grade. */
export function offVocabPx(img: Img, vocab: ReadonlySet<string>): number {
  let n = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const c = img.get(x, y);
      if (c[3] <= OPAQUE) continue;
      if (!vocab.has(colorKey(c))) n++;
    }
  }
  return n;
}

/** Max deviation of any frame's centroid-x from the clip's own mean. Catches
 * a cycle that walks itself sideways without punishing a deliberate lean the
 * way a rest-pose comparison would. */
export function cxWobble(cxs: readonly number[]): number {
  if (cxs.length === 0) return 0;
  const mean = cxs.reduce((a, b) => a + b, 0) / cxs.length;
  return cxs.reduce((worst, v) => Math.max(worst, Math.abs(v - mean)), 0);
}
