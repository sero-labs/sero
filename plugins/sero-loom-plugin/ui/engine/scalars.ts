// Bridges graph Scalars to TSL. Plain numbers become uniforms (tweened live, no
// recompile); expressions compile to nodes (rebuilt when the string changes).

import { float, uniform } from 'three/tsl';
import { Vector3 } from 'three/webgpu';

import type { Palette, Scalar, Vec3 } from '../../shared/graph';
import { compileExprSafe, type ExprEnv } from './expr-compile';
import { paletteRGB } from './nodes';

export type Path = (string | number)[];
export interface ScalarEntry { path: Path; uni: any }
export interface Registry {
  scalars: ScalarEntry[];
  vectors: ScalarEntry[];
}

export function newRegistry(): Registry {
  return { scalars: [], vectors: [] };
}

export type Resolver = (env: ExprEnv) => any;

/** A number → tweenable uniform; an expression → compiled (re-emitted per env). */
export function resolveScalar(s: Scalar, fallback: number, reg: Registry, path: Path): Resolver {
  if (typeof s === 'number') {
    const u = uniform(Number.isFinite(s) ? s : fallback);
    reg.scalars.push({ path, uni: u });
    return () => u;
  }
  return (env) => compileExprSafe(s.expr, env, float(fallback));
}

export function registerVec3(value: Vec3, reg: Registry, path: Path): any {
  const u = uniform(new Vector3(value[0], value[1], value[2]));
  reg.vectors.push({ path, uni: u });
  return u;
}

/** Build a palette color function color(t) from registered, tweenable vec3s. */
export function paletteFn(palette: Palette, reg: Registry, basePath: Path): (t: any) => any {
  const a = registerVec3(palette.a, reg, [...basePath, 'a']);
  const b = registerVec3(palette.b, reg, [...basePath, 'b']);
  const c = registerVec3(palette.c, reg, [...basePath, 'c']);
  const d = registerVec3(palette.d, reg, [...basePath, 'd']);
  return (t: any) => paletteRGB(a, b, c, d, t);
}
