/**
 * Review renderers — the images a judge (human or vision model) actually
 * looks at. Ported from tools/puppet/review_sheet.gd and rest_compare.gd.
 * Everything returns an Img; the caller encodes (PNG, canvas, whatever).
 *
 * Sheets auto-scale to land near 1900 px wide, which is what an image reader
 * can actually resolve — past that a viewer downsamples and you lose the
 * pixels you were trying to inspect.
 */

import type { Color } from './img';
import { Img } from './img';

const TARGET_W = 1900;
const GAP = 2;

const BG = rgb(0.07, 0.06, 0.16);
const SIL_FILL = rgb(0.9, 0.93, 1.0);
const SIL_BG = rgb(0.1, 0.09, 0.2);

function rgb(r: number, g: number, b: number): Color {
  return [r, g, b, 1];
}

/** Nearest-neighbour upscale — the only legal way to enlarge pixel art. */
export function scaleNearest(src: Img, k: number): Img {
  const out = new Img(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      out.set(x, y, src.get(Math.floor(x / k), Math.floor(y / k)));
    }
  }
  return out;
}

/** Frames left to right — how the motion flows in time. A clip too long for
 * one row inside the 1900px target wraps onto further rows rather than
 * rendering wider than a reader can resolve. */
export function frameStrip(frames: readonly Img[], background: Color = BG): Img {
  return frameStripScaled(frames, background).img;
}

/** `frameStrip`, also reporting the nearest-neighbour scale it chose — a
 * caption that says "at 4x" must read the scale the strip was actually
 * rendered at, not the one the caller hoped for. */
export function frameStripScaled(
  frames: readonly Img[],
  background: Color = BG,
): { img: Img; scale: number } {
  const w = frames[0].w;
  const h = frames[0].h;
  const cols = Math.min(frames.length, rowCapacity(w));
  const rows = Math.ceil(frames.length / cols);
  const gw = cols * (w + GAP) + GAP;
  const gh = rows * (h + GAP) + GAP;
  const scale = clampScale(gw);
  const out = filled(gw, gh, background);
  frames.forEach((f, i) =>
    blit(out, f, GAP + (i % cols) * (w + GAP), GAP + Math.floor(i / cols) * (h + GAP)),
  );
  return { img: scaleNearest(out, scale), scale };
}

/** How many frames of width `w` fit in one row without passing TARGET_W. */
function rowCapacity(w: number): number {
  return Math.max(1, Math.floor((TARGET_W - GAP) / (w + GAP)));
}

/** Frames in a grid, zoomed hard — POSE detail. With `silhouette`, every
 * opaque pixel becomes one value: the readability test that matters at
 * gameplay size. If the pose does not read in solid black, no amount of
 * shading will save it. */
export function poseGrid(frames: readonly Img[], silhouette = false): Img {
  const n = frames.length;
  const w = frames[0].w;
  const h = frames[0].h;
  const cols = Math.min(n <= 5 ? n : Math.ceil(n / 2), rowCapacity(w));
  const rows = Math.ceil(n / cols);
  const gw = cols * (w + GAP) + GAP;
  const gh = rows * (h + GAP) + GAP;
  const scale = clampScale(gw);
  const out = filled(gw, gh, silhouette ? SIL_BG : BG);
  frames.forEach((f, i) => {
    const src = silhouette ? silhouetteOf(f) : f;
    blit(out, src, GAP + (i % cols) * (w + GAP), GAP + Math.floor(i / cols) * (h + GAP));
  });
  return scaleNearest(out, scale);
}

/** The rest frame beside a reference image, on a flat ground — the character
 * checkpoint's evidence picture. Both are bottom-aligned so the baselines
 * line up. */
export function sideBySide(left: Img, right: Img, background: Color = BG): Img {
  const gap = 4;
  const h = Math.max(left.h, right.h) + gap * 2;
  const w = left.w + right.w + gap * 3;
  const scale = clampScale(w, 12);
  const out = filled(w, h, background);
  blit(out, left, gap, h - gap - left.h);
  blit(out, right, gap * 2 + left.w, h - gap - right.h);
  return scaleNearest(out, scale);
}

/** One frame, enlarged for close inspection (16x by default). */
export function zoom(img: Img, k = 16): Img {
  return scaleNearest(img, k);
}

function silhouetteOf(src: Img): Img {
  const out = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.alpha(x, y) >= 0.5) out.set(x, y, SIL_FILL);
    }
  }
  return out;
}

function filled(w: number, h: number, c: Color): Img {
  const out = new Img(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.set(x, y, c);
  }
  return out;
}

function blit(dst: Img, src: Img, ox: number, oy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c[3] > 0.001) dst.blend(ox + x, oy + y, c);
    }
  }
}

function clampScale(width: number, max = 20): number {
  return Math.min(max, Math.max(1, Math.floor(TARGET_W / width)));
}
