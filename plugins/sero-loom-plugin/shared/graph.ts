// The Loom graph: an open, layered scene document the agent authors. Any numeric
// field may be a constant OR an { expr } string compiled to TSL. Layers blend in
// order so paradigms (raymarch / particles) can be combined freely.

import { validateExprWith } from './expr';

export type Vec3 = [number, number, number];
export type Scalar = number | { expr: string };
export type Vec3Scalar = [Scalar, Scalar, Scalar];

export interface Palette {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
}

export type BlendMode = 'normal' | 'add' | 'screen';
export type ShapeKind = 'sphere' | 'box' | 'torus' | 'capsule';
export type SdfOpKind = 'smin' | 'union' | 'subtract' | 'intersect';
export type SdfWarpKind = 'twist' | 'repeat';

// ── SDF tree (composable) ───────────────────────────────────────

export interface SdfShape {
  kind: 'shape';
  shape: ShapeKind;
  size: Scalar;
  at: Vec3Scalar;
}
export interface SdfOp {
  kind: 'op';
  op: SdfOpKind;
  k: Scalar;
  nodes: SdfNode[];
}
export interface SdfWarp {
  kind: 'warp';
  warp: SdfWarpKind;
  amount: Scalar;
  node: SdfNode;
}
export type SdfNode = SdfShape | SdfOp | SdfWarp;

// ── Layers ──────────────────────────────────────────────────────

interface LayerBase {
  id: string;
  blend: BlendMode;
  opacity: Scalar;
  enabled: boolean;
}

export interface RaymarchLayer extends LayerBase {
  type: 'raymarch';
  camera: { distance: Scalar; orbitSpeed: Scalar; height: Scalar };
  sdf: SdfNode;
  palette: Palette;
  colorDrive: string; // expr → palette input; vars: t, depth, ny
  glow: Scalar;
  fractalFold: number; // structural
}

export interface ParticleLayer extends LayerBase {
  type: 'particles';
  count: number; // structural
  field: string; // expr → vec3 flow; vars: p, t, id
  strength: Scalar;
  spread: Scalar;
  pointSize: Scalar;
  palette: Palette;
  colorDrive: string; // expr → palette input; vars: t, id, speed
}

export type Layer = RaymarchLayer | ParticleLayer;

export interface LoomGraph {
  background: Vec3;
  speed: number; // global time multiplier (plain number)
  layers: Layer[];
}

// ── Bounds (crash-safety only — NOT aesthetic) ──────────────────

export const MAX_LAYERS = 6;
export const MAX_PARTICLES = 1_500_000;
export const MAX_SDF_NODES = 48;
export const MAX_FRACTAL_FOLD = 6;

// ── Helpers ─────────────────────────────────────────────────────

export function isExpr(s: unknown): s is { expr: string } {
  return typeof s === 'object' && s !== null && typeof (s as { expr?: unknown }).expr === 'string';
}

/** Numeric value of a Scalar for UI preview (expressions fall back). */
export function scalarNum(s: Scalar, fallback = 0): number {
  return typeof s === 'number' && Number.isFinite(s) ? s : fallback;
}

const DEFAULT_PALETTE: Palette = {
  a: [0.5, 0.5, 0.5],
  b: [0.5, 0.5, 0.5],
  c: [1, 1, 1],
  d: [0, 0.1, 0.2],
};

export const DEFAULT_GRAPH: LoomGraph = {
  background: [0.02, 0.02, 0.05],
  speed: 1,
  layers: [
    {
      id: 'core',
      type: 'raymarch',
      blend: 'normal',
      opacity: 1,
      enabled: true,
      camera: { distance: 4, orbitSpeed: 0.3, height: 0.6 },
      sdf: {
        kind: 'op',
        op: 'smin',
        k: { expr: '0.5 + 0.15*sin(t*0.5)' },
        nodes: [
          { kind: 'shape', shape: 'sphere', size: { expr: '1 + 0.25*sin(t)' }, at: [0, 0, 0] },
          { kind: 'shape', shape: 'torus', size: 0.7, at: [{ expr: '0.6*sin(t*0.4)' }, 0.1, 0] },
        ],
      },
      palette: DEFAULT_PALETTE,
      colorDrive: '0.25*depth + 0.4*ny + 0.02*t',
      glow: 0.4,
      fractalFold: 0,
    },
  ],
};

// ── Normalization (lenient — keep user/agent intent, fix structure) ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normScalar(v: unknown, fallback: Scalar): Scalar {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (isExpr(v)) return { expr: v.expr };
  return fallback;
}

function normVec3(v: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length < 3) return [...fallback];
  return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
}

function normVec3Scalar(v: unknown, fallback: Vec3Scalar): Vec3Scalar {
  if (!Array.isArray(v) || v.length < 3) return [fallback[0], fallback[1], fallback[2]];
  return [normScalar(v[0], fallback[0]), normScalar(v[1], fallback[1]), normScalar(v[2], fallback[2])];
}

function normPalette(v: unknown): Palette {
  const p = isRecord(v) ? v : {};
  return {
    a: normVec3(p.a, DEFAULT_PALETTE.a),
    b: normVec3(p.b, DEFAULT_PALETTE.b),
    c: normVec3(p.c, DEFAULT_PALETTE.c),
    d: normVec3(p.d, DEFAULT_PALETTE.d),
  };
}

function pickStr<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function normSdf(v: unknown, depth = 0): SdfNode {
  const fallbackShape: SdfShape = { kind: 'shape', shape: 'sphere', size: 1, at: [0, 0, 0] };
  if (!isRecord(v) || depth > 8) return fallbackShape;
  if (v.kind === 'op') {
    const nodes = Array.isArray(v.nodes) ? v.nodes.slice(0, MAX_LAYERS).map((n) => normSdf(n, depth + 1)) : [];
    if (nodes.length === 0) nodes.push(fallbackShape);
    return { kind: 'op', op: pickStr(v.op, ['smin', 'union', 'subtract', 'intersect'] as const, 'smin'), k: normScalar(v.k, 0.5), nodes };
  }
  if (v.kind === 'warp') {
    return { kind: 'warp', warp: pickStr(v.warp, ['twist', 'repeat'] as const, 'twist'), amount: normScalar(v.amount, 1), node: normSdf(v.node, depth + 1) };
  }
  return {
    kind: 'shape',
    shape: pickStr(v.shape, ['sphere', 'box', 'torus', 'capsule'] as const, 'sphere'),
    size: normScalar(v.size, 1),
    at: normVec3Scalar(v.at, [0, 0, 0]),
  };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}`;
}

function normLayer(v: unknown): Layer | null {
  if (!isRecord(v)) return null;
  const base = {
    id: typeof v.id === 'string' ? v.id : nextId('layer'),
    blend: pickStr(v.blend, ['normal', 'add', 'screen'] as const, 'normal'),
    opacity: normScalar(v.opacity, 1),
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
  if (v.type === 'particles') {
    return {
      ...base,
      type: 'particles',
      count: Math.max(1000, Math.min(MAX_PARTICLES, Math.round(Number(v.count) || 150_000))),
      field: typeof v.field === 'string' ? v.field : 'vec3(sin(p.y*2+t), cos(p.z*2+t), sin(p.x*2+t))',
      strength: normScalar(v.strength, 0.6),
      spread: normScalar(v.spread, 1.3),
      pointSize: normScalar(v.pointSize, 2),
      palette: normPalette(v.palette),
      colorDrive: typeof v.colorDrive === 'string' ? v.colorDrive : 'id + t*0.02',
    };
  }
  const cam = isRecord(v.camera) ? v.camera : {};
  return {
    ...base,
    type: 'raymarch',
    camera: {
      distance: normScalar(cam.distance, 4),
      orbitSpeed: normScalar(cam.orbitSpeed, 0.3),
      height: normScalar(cam.height, 0.6),
    },
    sdf: normSdf(v.sdf),
    palette: normPalette(v.palette),
    colorDrive: typeof v.colorDrive === 'string' ? v.colorDrive : '0.25*depth + 0.4*ny + 0.02*t',
    glow: normScalar(v.glow, 0.4),
    fractalFold: Math.max(0, Math.min(MAX_FRACTAL_FOLD, Math.round(Number(v.fractalFold) || 0))),
  };
}

export function normalizeGraph(v: unknown): LoomGraph {
  if (!isRecord(v)) return structuredClone(DEFAULT_GRAPH);
  const layers = Array.isArray(v.layers)
    ? v.layers.slice(0, MAX_LAYERS).map(normLayer).filter((l): l is Layer => l !== null)
    : [];
  if (layers.length === 0) layers.push(...structuredClone(DEFAULT_GRAPH).layers);
  return {
    background: normVec3(v.background, DEFAULT_GRAPH.background),
    speed: typeof v.speed === 'number' && Number.isFinite(v.speed) ? Math.max(0, Math.min(8, v.speed)) : 1,
    layers,
  };
}

// ── Validation: collect expression errors for agent feedback ─────

export interface GraphIssue {
  path: string;
  expr: string;
  error: string;
}

// Variable sets per field context — MUST match the env each field is compiled
// with (see ui/engine/sdf-compile.ts and the layer builders). `pi` is implicit.
const VARS = {
  time: new Set(['t']),
  sdf: new Set(['t', 'p']), // size / at / k / amount
  rayDrive: new Set(['t', 'depth', 'ny']),
  partField: new Set(['t', 'p', 'id']),
  partDrive: new Set(['t', 'id', 'speed']),
};

function checkScalar(s: Scalar, path: string, vars: Set<string>, issues: GraphIssue[]): void {
  if (isExpr(s)) {
    const r = validateExprWith(s.expr, vars);
    if (!r.ok) issues.push({ path, expr: s.expr, error: r.error ?? 'invalid' });
  }
}

function checkSdf(n: SdfNode, path: string, issues: GraphIssue[]): void {
  if (n.kind === 'shape') {
    checkScalar(n.size, `${path}.size`, VARS.sdf, issues);
    n.at.forEach((c, i) => checkScalar(c, `${path}.at[${i}]`, VARS.sdf, issues));
  } else if (n.kind === 'op') {
    checkScalar(n.k, `${path}.k`, VARS.sdf, issues);
    n.nodes.forEach((c, i) => checkSdf(c, `${path}.nodes[${i}]`, issues));
  } else {
    checkScalar(n.amount, `${path}.amount`, VARS.sdf, issues);
    checkSdf(n.node, `${path}.node`, issues);
  }
}

/** Returns expression issues (empty = all good), validated with each field's
 *  exact variable scope so the agent learns about render-time fallbacks. */
export function validateGraph(graph: LoomGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  graph.layers.forEach((layer, i) => {
    const p = `layers[${i}]`;
    checkScalar(layer.opacity, `${p}.opacity`, VARS.time, issues);
    const addStr = (expr: string, key: string, vars: Set<string>) => {
      const r = validateExprWith(expr, vars);
      if (!r.ok) issues.push({ path: `${p}.${key}`, expr, error: r.error ?? 'invalid' });
    };
    if (layer.type === 'raymarch') {
      checkScalar(layer.camera.distance, `${p}.camera.distance`, VARS.time, issues);
      checkScalar(layer.camera.orbitSpeed, `${p}.camera.orbitSpeed`, VARS.time, issues);
      checkScalar(layer.camera.height, `${p}.camera.height`, VARS.time, issues);
      checkScalar(layer.glow, `${p}.glow`, VARS.time, issues);
      checkSdf(layer.sdf, `${p}.sdf`, issues);
      addStr(layer.colorDrive, 'colorDrive', VARS.rayDrive);
    } else {
      checkScalar(layer.strength, `${p}.strength`, VARS.time, issues);
      checkScalar(layer.spread, `${p}.spread`, VARS.time, issues);
      checkScalar(layer.pointSize, `${p}.pointSize`, VARS.time, issues);
      addStr(layer.field, 'field', VARS.partField);
      addStr(layer.colorDrive, 'colorDrive', VARS.partDrive);
    }
  });
  return issues;
}

// ── Rebuild key: changes only when a shader recompile is required ──
// Plain numbers (and palette/background) are tweenable uniforms → represented as
// 'n' so number tweaks don't trigger a rebuild. Expressions and structure do.

function scalarKey(s: Scalar): string {
  return isExpr(s) ? `e:${s.expr}` : 'n';
}

function sdfKey(n: SdfNode): string {
  if (n.kind === 'shape') return `s:${n.shape}|${scalarKey(n.size)}|${n.at.map(scalarKey).join(',')}`;
  if (n.kind === 'op') return `o:${n.op}|${scalarKey(n.k)}|[${n.nodes.map(sdfKey).join(';')}]`;
  return `w:${n.warp}|${scalarKey(n.amount)}|${sdfKey(n.node)}`;
}

export function rebuildKey(g: LoomGraph): string {
  return g.layers
    .map((l) => {
      if (l.type === 'raymarch') {
        return `R|${l.blend}|${scalarKey(l.opacity)}|cam:${scalarKey(l.camera.distance)},${scalarKey(l.camera.orbitSpeed)},${scalarKey(l.camera.height)}|glow:${scalarKey(l.glow)}|fold:${l.fractalFold}|drive:${l.colorDrive}|${sdfKey(l.sdf)}`;
      }
      return `P|${l.blend}|${scalarKey(l.opacity)}|count:${l.count}|field:${l.field}|str:${scalarKey(l.strength)}|spr:${scalarKey(l.spread)}|sz:${scalarKey(l.pointSize)}|drive:${l.colorDrive}`;
    })
    .join('||');
}

// ── Patch merge (what loom_compose applies for partial updates) ──

export function mergeGraphPatch(base: LoomGraph, patch: unknown): LoomGraph {
  if (!isRecord(patch)) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    // `layers` is replaced wholesale when present (agent sends the full list).
    merged[key] = patch[key];
  }
  return normalizeGraph(merged);
}

// ── Random graph generator (loom_random) ────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomGraph(seed = Math.floor(Math.random() * 1e6)): LoomGraph {
  const rnd = mulberry32(seed);
  const rng = (lo: number, hi: number) => +(lo + rnd() * (hi - lo)).toFixed(2);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

  const palette = (): Palette => ({
    a: [0.5, 0.5, 0.5],
    b: [rng(0.3, 0.55), rng(0.3, 0.55), rng(0.3, 0.55)],
    c: [rng(0.6, 1.4), rng(0.6, 1.4), rng(0.6, 1.4)],
    d: [rng(0, 1), rng(0, 1), rng(0, 1)],
  });

  const layers: Layer[] = [];
  const wantParticles = rnd() > 0.4;
  const wantRaymarch = !wantParticles || rnd() > 0.5;

  if (wantRaymarch) {
    const shapeCount = 1 + Math.floor(rnd() * 3);
    const nodes: SdfNode[] = Array.from({ length: shapeCount }, () => ({
      kind: 'shape',
      shape: pick(['sphere', 'box', 'torus', 'capsule'] as const),
      size: { expr: `${rng(0.4, 1.1)} + ${rng(0, 0.3)}*sin(t*${rng(0.3, 1.5)})` },
      at: [rng(-1, 1), rng(-1, 1), rng(-0.6, 0.6)] as Vec3Scalar,
    }));
    layers.push({
      id: 'rm', type: 'raymarch', blend: 'normal', opacity: 1, enabled: true,
      camera: { distance: rng(2.5, 5.5), orbitSpeed: rng(0, 0.7), height: rng(0.2, 1) },
      sdf: { kind: 'op', op: 'smin', k: rng(0.2, 0.9), nodes },
      palette: palette(),
      colorDrive: `${rng(0.1, 0.4)}*depth + ${rng(0.2, 0.6)}*ny + 0.02*t`,
      glow: rng(0.1, 0.7),
      fractalFold: rnd() > 0.75 ? 1 + Math.floor(rnd() * 3) : 0,
    });
  }
  if (wantParticles) {
    const f = rng(1.5, 3.5);
    layers.push({
      id: 'pt', type: 'particles', blend: wantRaymarch ? 'add' : 'normal', opacity: 1, enabled: true,
      count: pick([80_000, 150_000, 300_000]),
      field: `vec3(sin(p.y*${f}+t), cos(p.z*${f}+t*${rng(0.5, 1.5)}), sin(p.x*${f}-t))`,
      strength: rng(0.4, 1.2), spread: rng(0.9, 1.6), pointSize: rng(1, 3.5),
      palette: palette(),
      colorDrive: `id + t*${rng(0.01, 0.06)}`,
    });
  }

  return normalizeGraph({ background: [rng(0, 0.06), rng(0, 0.06), rng(0.01, 0.1)], speed: rng(0.6, 1.6), layers });
}

// ── Legacy v1 (LoomConfig) → v2 graph migration ─────────────────

export function migrateLegacyConfig(v: unknown): LoomGraph {
  if (!isRecord(v)) return structuredClone(DEFAULT_GRAPH);
  const palette = normPalette(v.palette);
  const speed = isRecord(v.motion) && typeof v.motion.speed === 'number' ? v.motion.speed : 1;
  const background = normVec3(v.background, DEFAULT_GRAPH.background);

  if (v.paradigm === 'particles' && isRecord(v.particles)) {
    const p = v.particles;
    return normalizeGraph({
      background, speed,
      layers: [{
        id: 'pt', type: 'particles', blend: 'normal', opacity: 1, enabled: true,
        count: Number(p.count) || 150_000,
        field: 'vec3(sin(p.y*2+t), cos(p.z*2+t), sin(p.x*2+t))',
        strength: Number(p.fieldStrength) || 0.6, spread: 1.3, pointSize: Number(p.pointSize) || 2,
        palette, colorDrive: 'id + t*0.02',
      }],
    });
  }

  const rm = isRecord(v.raymarch) ? v.raymarch : {};
  const prims = Array.isArray(rm.primitives) ? rm.primitives : [];
  const nodes: SdfNode[] = prims.map((pr) => {
    const p = isRecord(pr) ? pr : {};
    return {
      kind: 'shape',
      shape: pickStr(p.shape, ['sphere', 'box', 'torus', 'capsule'] as const, 'sphere'),
      size: Number(p.scale) || 1,
      at: normVec3Scalar(p.position, [0, 0, 0]),
    } as SdfShape;
  });
  return normalizeGraph({
    background, speed,
    layers: [{
      id: 'rm', type: 'raymarch', blend: 'normal', opacity: 1, enabled: true,
      camera: { distance: Number(rm.cameraDistance) || 4, orbitSpeed: Number(rm.cameraOrbitSpeed) || 0.3, height: 0.6 },
      sdf: nodes.length ? { kind: 'op', op: 'smin', k: Number(rm.blendSmoothness) || 0.5, nodes } : structuredClone(DEFAULT_GRAPH).layers[0] && (DEFAULT_GRAPH.layers[0] as RaymarchLayer).sdf,
      palette,
      colorDrive: '0.25*depth + 0.4*ny + 0.02*t',
      glow: Number(rm.glow) || 0.4,
      fractalFold: Number(rm.fractalIterations) || 0,
    }],
  });
}
