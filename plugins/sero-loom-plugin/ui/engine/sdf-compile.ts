// Compile a composable SdfNode tree into a TSL distance function (p) => float.
// Expressions inside (size/at/k/amount) see vars { t, p }.

import { cos, floor, max, min, sin, vec3 } from 'three/tsl';

import type { SdfNode, SdfOpKind } from '../../shared/graph';
import { shapeSdf, smin } from './nodes';
import { resolveScalar, type Path, type Registry } from './scalars';

function combine(op: SdfOpKind, d: any, di: any, k: any): any {
  switch (op) {
    case 'union':
      return min(d, di);
    case 'subtract':
      return max(d, di.negate());
    case 'intersect':
      return max(d, di);
    case 'smin':
    default:
      return smin(d, di, k);
  }
}

function twist(p: any, amt: any): any {
  const ang = p.y.mul(amt);
  const c = cos(ang);
  const s = sin(ang);
  return vec3(p.x.mul(c).sub(p.z.mul(s)), p.y, p.x.mul(s).add(p.z.mul(c)));
}

function repeat(p: any, amt: any): any {
  const cell = max(amt, 0.1);
  const q = p.div(cell);
  return q.sub(floor(q.add(0.5))).mul(cell);
}

export type SdfFn = (p: any) => any;

export function compileSdf(node: SdfNode, path: Path, reg: Registry, uTime: any): SdfFn {
  if (node.kind === 'shape') {
    const sizeR = resolveScalar(node.size, 1, reg, [...path, 'size']);
    const axR = resolveScalar(node.at[0], 0, reg, [...path, 'at', 0]);
    const ayR = resolveScalar(node.at[1], 0, reg, [...path, 'at', 1]);
    const azR = resolveScalar(node.at[2], 0, reg, [...path, 'at', 2]);
    return (p: any) => {
      const env = { t: uTime, p };
      const at = vec3(axR(env), ayR(env), azR(env));
      return shapeSdf(node.shape, p.sub(at), sizeR(env));
    };
  }

  if (node.kind === 'op') {
    const kR = resolveScalar(node.k, 0.5, reg, [...path, 'k']);
    const children = node.nodes.map((n, i) => compileSdf(n, [...path, 'nodes', i], reg, uTime));
    return (p: any) => {
      const env = { t: uTime, p };
      let d = children[0](p);
      for (let i = 1; i < children.length; i++) {
        d = combine(node.op, d, children[i](p), kR(env));
      }
      return d;
    };
  }

  // warp
  const amtR = resolveScalar(node.amount, 1, reg, [...path, 'amount']);
  const inner = compileSdf(node.node, [...path, 'node'], reg, uTime);
  const warp = node.warp;
  return (p: any) => {
    const env = { t: uTime, p };
    const amt = amtR(env);
    return inner(warp === 'twist' ? twist(p, amt) : repeat(p, amt));
  };
}
