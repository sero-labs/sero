// The Loom v3 piece model: a piece of art is real multi-pass GLSL (Shadertoy
// conventions) plus a small set of agent-declared controls. Validation here is
// crash-safety only (structural bounds) — the compiler is the real validator,
// never a hand-written GLSL linter.

export type PassId = 'A' | 'B' | 'C' | 'D' | 'image';
export type Channel = 0 | 1 | 2 | 3;

export interface ChannelBinding {
  channel: Channel;
  /** Which pass's output this channel samples; 'self' = this pass's previous frame (feedback). */
  source: PassId | 'self';
}

export interface LoomPass {
  id: PassId;
  /** GLSL ES 3.00 fragment source implementing mainImage(out vec4, in vec2). */
  code: string;
  inputs?: ChannelBinding[];
  /** Render-target scale relative to the canvas (buffer passes only). */
  scale?: number;
}

export type PieceParam =
  | { name: string; label: string; kind: 'slider'; min: number; max: number; default: number; step?: number }
  | { name: string; label: string; kind: 'color'; default: [number, number, number] }
  | { name: string; label: string; kind: 'toggle'; default: boolean }
  | { name: string; label: string; kind: 'xy'; default: [number, number] };

export type ParamValue = number | boolean | [number, number] | [number, number, number];

export interface LoomPiece {
  title: string;
  /** The concept in the agent's own words — travels with the piece. */
  idea: string;
  /** GLSL shared across passes (noise libs, palettes, SDF helpers). */
  common?: string;
  /** 1..5 passes; exactly one 'image' pass, always drawn last. */
  passes: LoomPass[];
  /** 0..8 declared controls, bound as u_<name> uniforms. */
  params: PieceParam[];
  paramValues: Record<string, ParamValue>;
}

export interface BuildError {
  pass: PassId;
  /** 1-indexed line in the agent's own source (or common), null when unmapped. */
  line: number | null;
  message: string;
}

export interface BuildReport {
  revision: number;
  status: 'ok' | 'error';
  errors: BuildError[];
  /** Recent average FPS, so the agent can reason about cost. */
  fps?: number;
}

export interface SeeRequest {
  id: string;
  frames: number;
  spacingSeconds: number;
  width: number;
}

export interface SeeResult {
  id: string;
  /** Absolute paths of the captured frames, written by the extension. */
  paths: string[];
  error?: string;
}

export const PIECE_LIMITS = {
  maxPasses: 5,
  maxCodeLength: 65_536,
  maxCommonLength: 65_536,
  maxParams: 8,
  minScale: 0.25,
  maxScale: 1,
} as const;

export const PARAM_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const PASS_IDS: readonly PassId[] = ['A', 'B', 'C', 'D', 'image'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function str(v: unknown, fallback: string, maxLen = 400): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : fallback;
}

export function clonePiece<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── Params ──────────────────────────────────────────────────────

function vecN(v: unknown, n: 2 | 3, fallback: number[]): number[] {
  if (!Array.isArray(v)) return [...fallback];
  return Array.from({ length: n }, (_, i) => clampNum(v[i], -1e6, 1e6, fallback[i] ?? 0));
}

function normalizeParam(v: unknown): PieceParam | null {
  if (!isRecord(v) || typeof v.name !== 'string' || !PARAM_NAME_RE.test(v.name)) return null;
  const name = v.name;
  const label = str(v.label, name, 60);
  switch (v.kind) {
    case 'slider': {
      const min = clampNum(v.min, -1e6, 1e6, 0);
      const max = Math.max(min, clampNum(v.max, -1e6, 1e6, 1));
      const def = clampNum(v.default, min, max, min);
      const step = Number.isFinite(Number(v.step)) && Number(v.step) > 0 ? Number(v.step) : undefined;
      return { name, label, kind: 'slider', min, max, default: def, ...(step !== undefined ? { step } : {}) };
    }
    case 'color':
      return { name, label, kind: 'color', default: vecN(v.default, 3, [0.5, 0.5, 0.5]).map((c) => Math.min(1, Math.max(0, c))) as [number, number, number] };
    case 'toggle':
      return { name, label, kind: 'toggle', default: v.default === true };
    case 'xy':
      return { name, label, kind: 'xy', default: vecN(v.default, 2, [0.5, 0.5]).map((c) => Math.min(1, Math.max(0, c))) as [number, number] };
    default:
      return null;
  }
}

export function normalizeParamValue(param: PieceParam, v: unknown): ParamValue {
  switch (param.kind) {
    case 'slider':
      return clampNum(v, param.min, param.max, param.default);
    case 'color':
      return vecN(v, 3, param.default).map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
    case 'toggle':
      return typeof v === 'boolean' ? v : param.default;
    case 'xy':
      return vecN(v, 2, param.default).map((c) => Math.min(1, Math.max(0, c))) as [number, number];
  }
}

// ── Passes ──────────────────────────────────────────────────────

function normalizeBinding(v: unknown): ChannelBinding | null {
  if (!isRecord(v)) return null;
  const channel = Number(v.channel);
  if (![0, 1, 2, 3].includes(channel)) return null;
  const source = v.source;
  if (source !== 'self' && !PASS_IDS.includes(source as PassId)) return null;
  return { channel: channel as Channel, source: source as PassId | 'self' };
}

function normalizePass(v: unknown): LoomPass | null {
  if (!isRecord(v) || !PASS_IDS.includes(v.id as PassId) || typeof v.code !== 'string') return null;
  const inputs = Array.isArray(v.inputs)
    ? v.inputs.map(normalizeBinding).filter((b): b is ChannelBinding => b !== null)
    : [];
  // One binding per channel — first wins.
  const seen = new Set<Channel>();
  const deduped = inputs.filter((b) => (seen.has(b.channel) ? false : (seen.add(b.channel), true)));
  const pass: LoomPass = { id: v.id as PassId, code: v.code.slice(0, PIECE_LIMITS.maxCodeLength) };
  if (deduped.length > 0) pass.inputs = deduped;
  if (v.scale !== undefined && v.id !== 'image') {
    pass.scale = clampNum(v.scale, PIECE_LIMITS.minScale, PIECE_LIMITS.maxScale, 1);
  }
  return pass;
}

const FALLBACK_IMAGE_CODE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(texture(iChannel0, uv).rgb, 1.0);
}`;

/** Structural normalization: dedupe pass ids, enforce exactly one image pass (moved last), clamp sizes. */
export function normalizePiece(input: unknown): LoomPiece {
  const v = isRecord(input) ? input : {};

  const rawPasses = Array.isArray(v.passes) ? v.passes.map(normalizePass).filter((p): p is LoomPass => p !== null) : [];
  const byId = new Map<PassId, LoomPass>();
  for (const p of rawPasses) if (!byId.has(p.id)) byId.set(p.id, p);

  const buffers = ['A', 'B', 'C', 'D'].map((id) => byId.get(id as PassId)).filter((p): p is LoomPass => p !== undefined);
  let image = byId.get('image');
  if (!image) {
    // No image pass: show the last buffer if there is one, else the default piece.
    if (buffers.length === 0) return clonePiece(DEFAULT_PIECE);
    const last = buffers[buffers.length - 1];
    image = { id: 'image', code: FALLBACK_IMAGE_CODE, inputs: [{ channel: 0, source: last.id }] };
  }
  const passes = [...buffers, image].slice(-PIECE_LIMITS.maxPasses);

  // Drop channel bindings that reference a pass this piece doesn't declare: they
  // compile fine but leave the sampler unbound (silent black), so normalize them
  // away rather than keep a dangling reference.
  const presentIds = new Set<PassId>(passes.map((p) => p.id));
  for (const p of passes) {
    if (!p.inputs) continue;
    const kept = p.inputs.filter((b) => b.source === 'self' || presentIds.has(b.source));
    if (kept.length > 0) p.inputs = kept;
    else delete p.inputs;
  }

  const params: PieceParam[] = [];
  const paramNames = new Set<string>();
  if (Array.isArray(v.params)) {
    for (const raw of v.params) {
      const p = normalizeParam(raw);
      if (p && !paramNames.has(p.name) && params.length < PIECE_LIMITS.maxParams) {
        paramNames.add(p.name);
        params.push(p);
      }
    }
  }

  const rawValues = isRecord(v.paramValues) ? v.paramValues : {};
  const paramValues: Record<string, ParamValue> = {};
  for (const p of params) paramValues[p.name] = normalizeParamValue(p, rawValues[p.name]);

  // Always emit `common` (even ''): the field must be defined so the UI's
  // default-merge (useAppState) can't treat an absent common as "missing" and
  // inject the default piece's common block into an unrelated piece.
  const common = typeof v.common === 'string' ? v.common.slice(0, PIECE_LIMITS.maxCommonLength) : '';
  return {
    title: str(v.title, 'Untitled', 120),
    idea: str(v.idea, '', 2000),
    common,
    passes,
    params,
    paramValues,
  };
}

/**
 * Key that changes only when a recompile is needed (code/structure/param decls).
 * Param VALUE changes tween as uniforms and never recompile.
 */
export function compileKey(piece: LoomPiece): string {
  return JSON.stringify({ common: piece.common ?? '', passes: piece.passes, params: piece.params });
}

// ── Default piece (never a blank canvas) ────────────────────────

const DEFAULT_COMMON = `float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.03;
    amp *= 0.5;
  }
  return v;
}`;

const DEFAULT_IMAGE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.12 * (0.3 + u_drift);

  vec2 q = vec2(fbm(uv * 1.6 + t), fbm(uv * 1.6 - t * 0.7 + 3.1));
  vec2 r = vec2(
    fbm(uv * 2.2 + u_warp * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(uv * 2.2 + u_warp * q + vec2(8.3, 2.8) - 0.13 * t)
  );
  float f = fbm(uv * 2.4 + u_warp * r);

  vec3 deep = vec3(0.015, 0.025, 0.045);
  vec3 col = mix(deep, u_tint, smoothstep(0.12, 0.92, f));
  col = mix(col, vec3(0.95, 0.87, 0.72), u_glow * smoothstep(0.52, 0.95, f * f + 0.3 * q.y));
  col *= 0.8 + 0.35 * r.y;
  col *= 1.0 - 0.35 * dot(uv, uv);

  fragColor = vec4(pow(max(col, 0.0), vec3(0.9)), 1.0);
}`;

export const DEFAULT_PIECE: LoomPiece = {
  title: 'First Light',
  idea: 'Slow domain-warped nebula — layered fbm folded through itself, deep teal with warm embers where the field peaks.',
  common: DEFAULT_COMMON,
  passes: [{ id: 'image', code: DEFAULT_IMAGE }],
  params: [
    { name: 'drift', label: 'Drift', kind: 'slider', min: 0, max: 2, default: 0.6 },
    { name: 'warp', label: 'Warp', kind: 'slider', min: 0, max: 3, default: 1.3 },
    { name: 'glow', label: 'Embers', kind: 'slider', min: 0, max: 1, default: 0.35 },
    { name: 'tint', label: 'Tint', kind: 'color', default: [0.12, 0.42, 0.5] },
  ],
  paramValues: { drift: 0.6, warp: 1.3, glow: 0.35, tint: [0.12, 0.42, 0.5] },
};
