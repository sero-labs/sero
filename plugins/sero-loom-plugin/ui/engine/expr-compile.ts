// Compile a parsed expression AST into a TSL node, against an environment of
// variable nodes. Unknown variables/functions throw, so callers can fall back.

import {
  abs, acos, asin, atan, ceil, clamp, cos, cross, dot, exp, float, floor, fract,
  length, log, max, min, mix, normalize, pow, sign, sin, smoothstep, sqrt, step, tan,
  vec2, vec3, vec4,
} from 'three/tsl';

import { parseExpr, type ExprNode } from '../../shared/expr';

export type ExprEnv = Record<string, any>;

// Cheap value-noise so `noise(x)` is available without MaterialX imports.
function noiseNode(x: any): any {
  const v = vec3(x, x, x); // splats a float; passes a vec3 through
  return fract(sin(dot(v, vec3(12.9898, 78.233, 37.719))).mul(43758.5453)).mul(2).sub(1);
}

const FN: Record<string, (a: any[]) => any> = {
  sin: (a) => sin(a[0]), cos: (a) => cos(a[0]), tan: (a) => tan(a[0]),
  asin: (a) => asin(a[0]), acos: (a) => acos(a[0]),
  atan: (a) => (a.length > 1 ? atan(a[0], a[1]) : atan(a[0])),
  abs: (a) => abs(a[0]), floor: (a) => floor(a[0]), ceil: (a) => ceil(a[0]),
  fract: (a) => fract(a[0]), sign: (a) => sign(a[0]), sqrt: (a) => sqrt(a[0]),
  exp: (a) => exp(a[0]), log: (a) => log(a[0]),
  pow: (a) => pow(a[0], a[1]), min: (a) => min(a[0], a[1]), max: (a) => max(a[0], a[1]),
  mod: (a) => a[0].mod(a[1]),
  mix: (a) => mix(a[0], a[1], a[2]), clamp: (a) => clamp(a[0], a[1], a[2]),
  smoothstep: (a) => smoothstep(a[0], a[1], a[2]), step: (a) => step(a[0], a[1]),
  length: (a) => length(a[0]), dot: (a) => dot(a[0], a[1]), cross: (a) => cross(a[0], a[1]),
  normalize: (a) => normalize(a[0]),
  vec2: (a) => vec2(a[0], a[1] ?? a[0]),
  vec3: (a) => vec3(a[0], a[1] ?? a[0], a[2] ?? a[0]),
  vec4: (a) => vec4(a[0], a[1] ?? a[0], a[2] ?? a[0], a[3] ?? 1),
  noise: (a) => noiseNode(a[0]),
};

const SWIZZLE = new Set(['x', 'y', 'z', 'w']);

function emit(node: ExprNode, env: ExprEnv): any {
  switch (node.k) {
    case 'num':
      return float(node.v);
    case 'var': {
      if (node.name === 'pi') return float(Math.PI);
      const v = env[node.name];
      if (v === undefined) throw new Error(`Unknown variable "${node.name}"`);
      return v;
    }
    case 'member': {
      if (!SWIZZLE.has(node.prop)) throw new Error(`Invalid component ".${node.prop}"`);
      return emit(node.obj, env)[node.prop];
    }
    case 'unary':
      return emit(node.x, env).negate();
    case 'bin': {
      const a = emit(node.a, env);
      const b = emit(node.b, env);
      switch (node.op) {
        case '+': return a.add(b);
        case '-': return a.sub(b);
        case '*': return a.mul(b);
        case '/': return a.div(b);
        case '%': return a.mod(b);
      }
      break;
    }
    case 'call': {
      const fn = FN[node.name];
      if (!fn) throw new Error(`Unknown function "${node.name}"`);
      return fn(node.args.map((arg) => emit(arg, env)));
    }
  }
  throw new Error('Bad expression node');
}

/** Compile an expression string to a TSL node, or return `fallback` on error. */
export function compileExprSafe(src: string, env: ExprEnv, fallback: any): any {
  try {
    return emit(parseExpr(src), env);
  } catch {
    return fallback;
  }
}
