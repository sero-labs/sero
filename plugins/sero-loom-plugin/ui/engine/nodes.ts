// Low-level TSL building blocks shared by the layer compilers. No coupling to a
// fixed uniform bag — everything takes explicit nodes so the graph compiler can
// wire them freely.

import { abs, clamp, cos, float, length, max, min, normalize, vec2, vec3 } from 'three/tsl';
import type { ShapeKind } from '../../shared/graph';

export const TAU = 6.28318530718;

// IQ cosine palette from explicit a,b,c,d nodes: a + b*cos(2π(c·t + d)).
export function paletteRGB(a: any, b: any, c: any, d: any, t: any): any {
  return a.add(b.mul(cos(c.mul(t).add(d).mul(TAU))));
}

// ── SDF primitives (float distance node) ────────────────────────

export function sdSphere(p: any, r: any): any {
  return length(p).sub(r);
}
export function sdBox(p: any, r: any): any {
  const q = abs(p).sub(vec3(r, r, r));
  return length(max(q, vec3(0, 0, 0))).add(min(max(q.x, max(q.y, q.z)), float(0)));
}
export function sdTorus(p: any, r: any): any {
  const q = vec2(length(vec2(p.x, p.z)).sub(r), p.y);
  return length(q).sub(r.mul(0.35));
}
export function sdCapsule(p: any, r: any): any {
  const py = clamp(p.y, r.negate(), r);
  return length(vec3(p.x, p.y.sub(py), p.z)).sub(r.mul(0.4));
}

export function shapeSdf(shape: ShapeKind, p: any, r: any): any {
  switch (shape) {
    case 'box':
      return sdBox(p, r);
    case 'torus':
      return sdTorus(p, r);
    case 'capsule':
      return sdCapsule(p, r);
    case 'sphere':
    default:
      return sdSphere(p, r);
  }
}

// Polynomial smooth-min.
export function smin(a: any, b: any, k: any): any {
  const kk = max(k, float(0.0001));
  const h = max(kk.sub(abs(a.sub(b))), float(0)).div(kk);
  return min(a, b).sub(h.mul(h).mul(kk).mul(0.25));
}

// Surface normal via SDF gradient.
export function calcNormal(sdf: (p: any) => any, p: any): any {
  const e = 0.0015;
  const dx = sdf(p.add(vec3(e, 0, 0))).sub(sdf(p.sub(vec3(e, 0, 0))));
  const dy = sdf(p.add(vec3(0, e, 0))).sub(sdf(p.sub(vec3(0, e, 0))));
  const dz = sdf(p.add(vec3(0, 0, e))).sub(sdf(p.sub(vec3(0, 0, e))));
  return normalize(vec3(dx, dy, dz));
}
