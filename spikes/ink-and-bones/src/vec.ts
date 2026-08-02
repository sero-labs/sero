/**
 * Minimal 2D math for the Ink & Bones port: vectors as plain `[x, y]` pairs
 * and rigid affine transforms (rotation + translation), matching Godot's
 * Transform2D closely enough that the skeleton code ports line for line.
 *
 * Convention carried over from the Godot original: an "api angle" of 0 points
 * screen-DOWN and positive swings the tip EAST. `fromRot` negates the angle
 * exactly as skeleton.gd does, so `apply(fromRot(deg), [0, 1])` equals
 * `unit(deg)`.
 */

export type Vec = readonly [number, number];

/** Column-major 2x3 affine: apply(p) = (a·x + c·y + tx, b·x + d·y + ty). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export const add = (p: Vec, q: Vec): Vec => [p[0] + q[0], p[1] + q[1]];
export const sub = (p: Vec, q: Vec): Vec => [p[0] - q[0], p[1] - q[1]];
export const scale = (p: Vec, s: number): Vec => [p[0] * s, p[1] * s];
export const dot = (p: Vec, q: Vec): number => p[0] * q[0] + p[1] * q[1];
export const len = (p: Vec): number => Math.hypot(p[0], p[1]);
export const len2 = (p: Vec): number => p[0] * p[0] + p[1] * p[1];
export const dist = (p: Vec, q: Vec): number => Math.hypot(p[0] - q[0], p[1] - q[1]);

export function normalize(p: Vec): Vec {
  const l = len(p);
  return l < 1e-6 ? [0, 1] : [p[0] / l, p[1] / l];
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Positive modulo, as GDScript's fposmod. */
export const fposmod = (v: number, m: number): number => ((v % m) + m) % m;

/** Unit vector of an api angle: 0 -> down, 90 -> east. */
export function unit(apiDeg: number): Vec {
  const r = degToRad(apiDeg);
  return [Math.sin(r), Math.cos(r)];
}

/**
 * A transform rotating by an API angle (negated internally, the skeleton.gd
 * trick) with its origin at `origin`.
 */
export function fromRot(apiDeg: number, origin: Vec): Affine {
  const r = -degToRad(apiDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, tx: origin[0], ty: origin[1] };
}

export const identity = (): Affine => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

/** Composition: (mul(A, B))(p) = A(B(p)). */
export function mul(A: Affine, B: Affine): Affine {
  return {
    a: A.a * B.a + A.c * B.b,
    b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d,
    d: A.b * B.c + A.d * B.d,
    tx: A.a * B.tx + A.c * B.ty + A.tx,
    ty: A.b * B.tx + A.d * B.ty + A.ty,
  };
}

export const apply = (T: Affine, p: Vec): Vec => [
  T.a * p[0] + T.c * p[1] + T.tx,
  T.b * p[0] + T.d * p[1] + T.ty,
];

/** Rotation only, no translation — Godot's basis_xform. */
export const basisXform = (T: Affine, p: Vec): Vec => [
  T.a * p[0] + T.c * p[1],
  T.b * p[0] + T.d * p[1],
];

/** Inverse of a rigid transform (rotation + translation only). */
export function inverse(T: Affine): Affine {
  // transpose of the rotation part; t' = -Rᵀ·t
  return {
    a: T.a,
    b: T.c,
    c: T.b,
    d: T.d,
    tx: -(T.a * T.tx + T.b * T.ty),
    ty: -(T.c * T.tx + T.d * T.ty),
  };
}
