// Shared TSL node builders for Loom's two paradigms.
//
// These are plain functions that compose TSL nodes from the engine's uniform
// bag. Keeping them dependency-light (no MaterialX noise imports) maximises the
// chance the shader graph compiles across three.js versions.

import {
  abs,
  cos,
  cross,
  dot,
  float,
  length,
  max,
  min,
  mix,
  normalize,
  sin,
  vec2,
  vec3,
} from 'three/tsl';

import type { LoomUniforms } from './uniforms';

export const TAU = 6.28318530718;

// Inigo Quilez cosine palette: color(t) = a + b * cos(2π(c·t + d)).
// All four are vec3 uniforms; `t` is a float node.
export function paletteColor(u: LoomUniforms, t: any): any {
  return u.pa.add(u.pb.mul(cos(u.pc.mul(t).add(u.pd).mul(TAU))));
}

// Cheap animated trig flow field — a smooth vector field in roughly [-1,1].
// `sample` already folds in frequency and time, so this is purely positional.
export function trigFlow(sample: any): any {
  return vec3(
    sin(dot(sample, vec3(12.9898, 78.233, 37.719))),
    sin(dot(sample, vec3(39.346, 11.135, 83.155))),
    sin(dot(sample, vec3(73.156, 52.235, 9.151))),
  );
}

// ── SDF primitives (return a float distance node) ───────────────

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
  // Vertical capsule of half-height ~r, radius ~0.4r.
  const h = r;
  const py = p.y.clamp(h.negate(), h);
  return length(vec3(p.x, p.y.sub(py), p.z)).sub(r.mul(0.4));
}

// Polynomial smooth-min — blends two SDFs with seam smoothing `k`.
export function smin(a: any, b: any, k: any): any {
  const kk = max(k, float(0.0001));
  const h = max(kk.sub(abs(a.sub(b))), float(0)).div(kk);
  return min(a, b).sub(h.mul(h).mul(kk).mul(0.25));
}

// ── Surface normal via gradient of an SDF function ──────────────

export function calcNormal(sdf: (p: any) => any, p: any): any {
  const e = 0.0015;
  const dx = sdf(p.add(vec3(e, 0, 0))).sub(sdf(p.sub(vec3(e, 0, 0))));
  const dy = sdf(p.add(vec3(0, e, 0))).sub(sdf(p.sub(vec3(0, e, 0))));
  const dz = sdf(p.add(vec3(0, 0, e))).sub(sdf(p.sub(vec3(0, 0, e))));
  return normalize(vec3(dx, dy, dz));
}

export { mix };
