/**
 * Ink & Bones — a painterly canvas for ONE part, in bone-local space.
 * Direct port of art/paint.gd.
 *
 * A part is painted once, at supersampled resolution (compositor SS = 4), in
 * the local frame of the bone it binds to: origin at the joint, +Y along the
 * bone. The part never knows it will be rotated. Shapes should be smooth and
 * generous — tapered capsules, broad shading — the grade makes the pixels.
 */

import { assertColor, assertNumber, assertPoints, assertVec, assertWidths } from './guard';
import type { Color } from './img';
import { Img, darkened } from './img';
import type { Vec } from './vec';
import { clamp, dot, len2, lerp, sub } from './vec';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SIG = {
  capsule: 'capsule(p0, p1, r0, r1, colour) — two points, two half-widths, one colour.',
  disc: 'disc(centre, r, colour).',
  polygon: 'polygon(points, colour) — three or more points, one colour.',
  // Both name the chain-painter call order: passing the Paint where the points
  // belong is the mistake that once drew a whole part as nothing.
  stroke:
    'stroke(points, widths, colour) — points and a per-point width ARRAY. A chain painter is ' +
    'called as painter(paint, points): the canvas first, the simulated points second.',
  ribbon:
    'ribbon(points, w0, w1, colour) — points, then the two end half-widths. A chain painter is ' +
    'called as painter(paint, points): the canvas first, the simulated points second.',
  tintToward: 'tintToward(dir, colour, depth) — a direction, a colour, a depth in px.',
  occludeAbove: 'occludeAbove(atY, depth, amount) — three numbers; amount is 0..1, not a colour.',
} as const;

export class Paint {
  readonly img: Img;
  /** Where local (0,0) — the bone joint — sits in img pixels. */
  readonly origin: Vec;

  constructor(rect: Rect) {
    this.img = new Img(rect.w, rect.h);
    this.origin = [-rect.x, -rect.y];
  }

  /** Tapered capsule from p0 (radius r0) to p1 (radius r1) — the workhorse. */
  capsule(p0: Vec, p1: Vec, r0: number, r1: number, c: Color): void {
    assertVec(p0, 'p0', 'capsule', SIG.capsule);
    assertVec(p1, 'p1', 'capsule', SIG.capsule);
    assertNumber(r0, 'r0', 'capsule', SIG.capsule);
    assertNumber(r1, 'r1', 'capsule', SIG.capsule);
    assertColor(c, 'colour', 'capsule', SIG.capsule);
    this.fillCapsule(p0, p1, r0, r1, c);
  }

  /** The unchecked capsule the other helpers fill through, once their own
   * arguments are validated — guards belong at the author's call, not in an
   * inner loop. */
  private fillCapsule(p0: Vec, p1: Vec, r0: number, r1: number, c: Color): void {
    const img = this.img;
    const a: Vec = [p0[0] + this.origin[0], p0[1] + this.origin[1]];
    const b: Vec = [p1[0] + this.origin[0], p1[1] + this.origin[1]];
    const rmax = Math.max(r0, r1);
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - rmax));
    const x1 = Math.min(img.w - 1, Math.ceil(Math.max(a[0], b[0]) + rmax));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - rmax));
    const y1 = Math.min(img.h - 1, Math.ceil(Math.max(a[1], b[1]) + rmax));
    const ab = sub(b, a);
    const l2 = len2(ab);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p: Vec = [x + 0.5, y + 0.5];
        const t = l2 === 0 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
        const r = lerp(r0, r1, t);
        const cx = a[0] + ab[0] * t;
        const cy = a[1] + ab[1] * t;
        const dx = p[0] - cx;
        const dy = p[1] - cy;
        if (dx * dx + dy * dy <= r * r) img.set(x, y, c);
      }
    }
  }

  disc(center: Vec, r: number, c: Color): void {
    assertVec(center, 'centre', 'disc', SIG.disc);
    assertNumber(r, 'r', 'disc', SIG.disc);
    assertColor(c, 'colour', 'disc', SIG.disc);
    this.fillCapsule(center, center, r, r, c);
  }

  /**
   * A filled polygon — the shape tool capsules cannot be: a helmet's flat
   * crown and angled brow, a shield's kite, a blade's taper. Even-odd fill of
   * the closed path through `points`; concave outlines and notches are fine.
   */
  polygon(points: readonly Vec[], c: Color): void {
    assertPoints(points, 'points', 'polygon', SIG.polygon);
    if (points.length < 3) {
      throw new Error(`polygon: needs at least three points, got ${points.length}. ${SIG.polygon}`);
    }
    assertColor(c, 'colour', 'polygon', SIG.polygon);
    const img = this.img;
    const xs = points.map((p) => p[0] + this.origin[0]);
    const ys = points.map((p) => p[1] + this.origin[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(img.h - 1, Math.ceil(Math.max(...ys)));
    const n = points.length;
    const crossings: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      crossings.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        // A crossing is counted on exactly one of the two edges meeting at a
        // vertex, so a scanline through a vertex fills once, not twice.
        if (ys[i] > py !== ys[j] > py) {
          crossings.push(xs[i] + ((py - ys[i]) / (ys[j] - ys[i])) * (xs[j] - xs[i]));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const xa = Math.max(0, Math.round(crossings[k]));
        const xb = Math.min(img.w - 1, Math.round(crossings[k + 1]) - 1);
        for (let x = xa; x <= xb; x++) img.set(x, y, c);
      }
    }
  }

  /** Polyline stroke with a per-point half-width profile. */
  stroke(points: readonly Vec[], widths: readonly number[], c: Color): void {
    assertPoints(points, 'points', 'stroke', SIG.stroke);
    assertWidths(widths, 'widths', 'stroke', SIG.stroke);
    assertColor(c, 'colour', 'stroke', SIG.stroke);
    for (let i = 0; i < points.length - 1; i++) {
      const w0 = widths[Math.min(i, widths.length - 1)];
      const w1 = widths[Math.min(i + 1, widths.length - 1)];
      this.fillCapsule(points[i], points[i + 1], w0, w1, c);
    }
  }

  /** A stroke tapering linearly from w0 to w1 — the shape of a chain. */
  ribbon(points: readonly Vec[], w0: number, w1: number, c: Color): void {
    assertPoints(points, 'points', 'ribbon', SIG.ribbon);
    assertNumber(w0, 'w0', 'ribbon', SIG.ribbon);
    assertNumber(w1, 'w1', 'ribbon', SIG.ribbon);
    assertColor(c, 'colour', 'ribbon', SIG.ribbon);
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const t0 = i / (n - 1);
      const t1 = (i + 1) / (n - 1);
      this.fillCapsule(points[i], points[i + 1], lerp(w0, w1, t0), lerp(w0, w1, t1), c);
    }
  }

  /**
   * Recolor pixels within `depth` of the silhouette edge on the side the
   * shape faces `dir` — lit and shaded sides, or a rim at a shallow depth.
   */
  tintToward(dir: Vec, c: Color, depth: number): void {
    assertVec(dir, 'dir', 'tintToward', SIG.tintToward);
    assertColor(c, 'colour', 'tintToward', SIG.tintToward);
    assertNumber(depth, 'depth', 'tintToward', SIG.tintToward);
    const img = this.img;
    const l = Math.hypot(dir[0], dir[1]) || 1;
    const dx = dir[0] / l;
    const dy = dir[1] / l;
    const steps = Math.ceil(depth);
    const hits: number[] = [];
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        if (img.alpha(x, y) < 0.5) continue;
        for (let k = 1; k <= steps; k++) {
          const qx = Math.floor(x + 0.5 + dx * k);
          const qy = Math.floor(y + 0.5 + dy * k);
          if (!img.inside(qx, qy) || img.alpha(qx, qy) < 0.5) {
            hits.push(y * img.w + x);
            break;
          }
        }
      }
    }
    for (const i of hits) img.set(i % img.w, Math.floor(i / img.w), c);
  }

  /** Darken toward local y = atY on the joint side — sells the joint. */
  occludeAbove(atY: number, depth: number, amount: number): void {
    assertNumber(atY, 'atY', 'occludeAbove', SIG.occludeAbove);
    assertNumber(depth, 'depth', 'occludeAbove', SIG.occludeAbove);
    assertNumber(amount, 'amount', 'occludeAbove', SIG.occludeAbove);
    const img = this.img;
    for (let y = 0; y < img.h; y++) {
      const ly = y + 0.5 - this.origin[1];
      if (ly > atY || ly < atY - depth) continue;
      const f = (atY - ly) / depth;
      for (let x = 0; x < img.w; x++) {
        const c = img.get(x, y);
        if (c[3] >= 0.5) img.set(x, y, darkened(c, amount * (1 - f)));
      }
    }
  }
}
