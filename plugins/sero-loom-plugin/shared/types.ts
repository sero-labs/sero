// Single source of truth for Loom state, shared across extension and UI.
// JSON-serialisable only — no Date, Map, Set, or functions.
//
// `LoomConfig` is the agent-facing payload: flat, typed, bounded knobs so an LLM
// can fill it in reliably and can never inject raw shader code.

// ── Primitive aliases ───────────────────────────────────────────

export type Vec3 = [number, number, number];

export type Paradigm = 'particles' | 'raymarch';
export type ParticleField = 'curl' | 'lorenz' | 'aizawa' | 'gravity';
export type ParticleColorMode = 'velocity' | 'age' | 'position';
export type SdfShape = 'sphere' | 'box' | 'torus' | 'capsule';
export type Quality = 'low' | 'medium' | 'high';
export type RendererBackend = 'auto' | 'webgpu' | 'webgl';
export type CaptureResolution = 'display' | '1080p' | '1440p' | '4k' | 'custom';

// ── Config sub-shapes ───────────────────────────────────────────

export interface MotionConfig {
  speed: number; // master time multiplier (0..3)
  turbulence: number; // global noise amplitude (0..1)
  seed: number; // deterministic RNG seed (integer)
}

export interface Palette {
  // Inigo Quilez cosine palette: color(t) = a + b * cos(2π(c·t + d))
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
}

export interface ParticleConfig {
  count: number; // resolved against quality budget
  field: ParticleField;
  fieldStrength: number; // 0..2
  noiseFrequency: number; // 0.05..4
  noiseEvolution: number; // 0..2 — how fast the field morphs over uTime
  pointSize: number; // 0.5..8
  trailFade: number; // 0..1 (reserved — soft trails)
  colorMode: ParticleColorMode;
}

export interface SdfPrimitive {
  shape: SdfShape;
  position: Vec3;
  scale: number; // 0.05..3
  morphAmount: number; // 0..1 — breathe amplitude on uTime
  morphSpeed: number; // 0..4
}

export interface RaymarchConfig {
  primitives: SdfPrimitive[]; // 1..MAX_PRIMITIVES blended shapes
  blendSmoothness: number; // 0..1 smooth-min k
  cameraDistance: number; // 1.5..8
  cameraOrbitSpeed: number; // 0..2
  glow: number; // 0..1
  fractalIterations: number; // 0..5 (0 = plain shapes)
}

export interface LoomConfig {
  paradigm: Paradigm;
  motion: MotionConfig;
  palette: Palette;
  background: Vec3;
  particles: ParticleConfig;
  raymarch: RaymarchConfig;
}

// ── Settings, presets, top-level state ──────────────────────────

export interface CaptureSettings {
  resolution: CaptureResolution;
  customWidth: number;
  customHeight: number;
  freezeOnCapture: boolean;
  writeSidecarConfig: boolean;
}

export interface LoomSettings {
  transitionMs: number;
  targetFps: number;
  paused: boolean;
  quality: Quality;
  rendererBackend: RendererBackend;
  capture: CaptureSettings;
}

export interface LoomPreset {
  id: string;
  name: string;
  createdAt: number;
  config: LoomConfig;
  thumbnail?: string; // small data-URL preview
}

export interface LoomState {
  version: 1;
  live: LoomConfig;
  presets: LoomPreset[];
  settings: LoomSettings;
}

// ── Bounds (single source of truth for clamping + random) ───────

export const MAX_PRIMITIVES = 6;

export const PARTICLE_BUDGET: Record<Quality, number> = {
  low: 60_000,
  medium: 250_000,
  high: 1_000_000,
};

interface Range {
  min: number;
  max: number;
}
const R = (min: number, max: number): Range => ({ min, max });

export const BOUNDS = {
  motion: { speed: R(0, 3), turbulence: R(0, 1), seed: R(0, 1_000_000) },
  particles: {
    count: R(1_000, 1_000_000),
    fieldStrength: R(0, 2),
    noiseFrequency: R(0.05, 4),
    noiseEvolution: R(0, 2),
    pointSize: R(0.5, 8),
    trailFade: R(0, 1),
  },
  primitive: {
    position: R(-2.5, 2.5),
    scale: R(0.05, 3),
    morphAmount: R(0, 1),
    morphSpeed: R(0, 4),
  },
  raymarch: {
    blendSmoothness: R(0, 1),
    cameraDistance: R(1.5, 8),
    cameraOrbitSpeed: R(0, 2),
    glow: R(0, 1),
    fractalIterations: R(0, 5),
  },
} as const;

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_CONFIG: LoomConfig = {
  paradigm: 'raymarch',
  motion: { speed: 1, turbulence: 0.5, seed: 1337 },
  palette: {
    // A warm-to-cool default that reads well on a dark background.
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.1, 0.2],
  },
  background: [0.02, 0.02, 0.05],
  particles: {
    count: 250_000,
    field: 'curl',
    fieldStrength: 1,
    noiseFrequency: 0.6,
    noiseEvolution: 0.4,
    pointSize: 2,
    trailFade: 0.6,
    colorMode: 'velocity',
  },
  raymarch: {
    primitives: [
      { shape: 'sphere', position: [0, 0, 0], scale: 1, morphAmount: 0.35, morphSpeed: 1 },
      { shape: 'torus', position: [0.6, 0.1, 0], scale: 0.7, morphAmount: 0.25, morphSpeed: 0.6 },
    ],
    blendSmoothness: 0.5,
    cameraDistance: 4,
    cameraOrbitSpeed: 0.3,
    glow: 0.4,
    fractalIterations: 0,
  },
};

export const DEFAULT_SETTINGS: LoomSettings = {
  transitionMs: 1500,
  targetFps: 60,
  paused: false,
  quality: 'medium',
  rendererBackend: 'auto',
  capture: {
    resolution: 'display',
    customWidth: 2560,
    customHeight: 1440,
    freezeOnCapture: true,
    writeSidecarConfig: true,
  },
};

export const DEFAULT_LOOM_STATE: LoomState = {
  version: 1,
  live: DEFAULT_CONFIG,
  presets: [],
  settings: DEFAULT_SETTINGS,
};

// ── Small utilities ─────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clamp(n: number, range: Range, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, n));
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function clampVec3(v: unknown, range: Range, fallback: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length < 3) return [...fallback];
  return [
    clamp(v[0] as number, range, fallback[0]),
    clamp(v[1] as number, range, fallback[1]),
    clamp(v[2] as number, range, fallback[2]),
  ];
}

// Palette channels are unbounded-ish but kept in a sane range for stability.
const PALETTE_RANGE = R(-2, 2);
function clampPaletteVec(v: unknown, fallback: Vec3): Vec3 {
  return clampVec3(v, PALETTE_RANGE, fallback);
}

// ── Clamp / normalize a full config ─────────────────────────────

export function clampConfig(input: unknown): LoomConfig {
  const v = isRecord(input) ? input : {};
  const motion = isRecord(v.motion) ? v.motion : {};
  const palette = isRecord(v.palette) ? v.palette : {};
  const particles = isRecord(v.particles) ? v.particles : {};
  const raymarch = isRecord(v.raymarch) ? v.raymarch : {};
  const d = DEFAULT_CONFIG;

  const primitivesRaw = Array.isArray(raymarch.primitives) ? raymarch.primitives : undefined;
  const primitives: SdfPrimitive[] = (primitivesRaw ?? d.raymarch.primitives)
    .slice(0, MAX_PRIMITIVES)
    .map((p, i) => {
      const fallback = d.raymarch.primitives[i] ?? d.raymarch.primitives[0];
      const pr = isRecord(p) ? p : {};
      return {
        shape: pickEnum<SdfShape>(pr.shape, ['sphere', 'box', 'torus', 'capsule'], fallback.shape),
        position: clampVec3(pr.position, BOUNDS.primitive.position, fallback.position),
        scale: clamp(pr.scale as number, BOUNDS.primitive.scale, fallback.scale),
        morphAmount: clamp(pr.morphAmount as number, BOUNDS.primitive.morphAmount, fallback.morphAmount),
        morphSpeed: clamp(pr.morphSpeed as number, BOUNDS.primitive.morphSpeed, fallback.morphSpeed),
      };
    });
  if (primitives.length === 0) primitives.push({ ...d.raymarch.primitives[0] });

  return {
    paradigm: pickEnum<Paradigm>(v.paradigm, ['particles', 'raymarch'], d.paradigm),
    motion: {
      speed: clamp(motion.speed as number, BOUNDS.motion.speed, d.motion.speed),
      turbulence: clamp(motion.turbulence as number, BOUNDS.motion.turbulence, d.motion.turbulence),
      seed: Math.round(clamp(motion.seed as number, BOUNDS.motion.seed, d.motion.seed)),
    },
    palette: {
      a: clampPaletteVec(palette.a, d.palette.a),
      b: clampPaletteVec(palette.b, d.palette.b),
      c: clampPaletteVec(palette.c, d.palette.c),
      d: clampPaletteVec(palette.d, d.palette.d),
    },
    background: clampVec3(v.background, R(0, 1), d.background),
    particles: {
      count: Math.round(clamp(particles.count as number, BOUNDS.particles.count, d.particles.count)),
      field: pickEnum<ParticleField>(particles.field, ['curl', 'lorenz', 'aizawa', 'gravity'], d.particles.field),
      fieldStrength: clamp(particles.fieldStrength as number, BOUNDS.particles.fieldStrength, d.particles.fieldStrength),
      noiseFrequency: clamp(particles.noiseFrequency as number, BOUNDS.particles.noiseFrequency, d.particles.noiseFrequency),
      noiseEvolution: clamp(particles.noiseEvolution as number, BOUNDS.particles.noiseEvolution, d.particles.noiseEvolution),
      pointSize: clamp(particles.pointSize as number, BOUNDS.particles.pointSize, d.particles.pointSize),
      trailFade: clamp(particles.trailFade as number, BOUNDS.particles.trailFade, d.particles.trailFade),
      colorMode: pickEnum<ParticleColorMode>(particles.colorMode, ['velocity', 'age', 'position'], d.particles.colorMode),
    },
    raymarch: {
      primitives,
      blendSmoothness: clamp(raymarch.blendSmoothness as number, BOUNDS.raymarch.blendSmoothness, d.raymarch.blendSmoothness),
      cameraDistance: clamp(raymarch.cameraDistance as number, BOUNDS.raymarch.cameraDistance, d.raymarch.cameraDistance),
      cameraOrbitSpeed: clamp(raymarch.cameraOrbitSpeed as number, BOUNDS.raymarch.cameraOrbitSpeed, d.raymarch.cameraOrbitSpeed),
      glow: clamp(raymarch.glow as number, BOUNDS.raymarch.glow, d.raymarch.glow),
      fractalIterations: Math.round(clamp(raymarch.fractalIterations as number, BOUNDS.raymarch.fractalIterations, d.raymarch.fractalIterations)),
    },
  };
}

function clampSettings(input: unknown): LoomSettings {
  const v = isRecord(input) ? input : {};
  const cap = isRecord(v.capture) ? v.capture : {};
  const d = DEFAULT_SETTINGS;
  return {
    transitionMs: clamp(v.transitionMs as number, R(0, 10_000), d.transitionMs),
    targetFps: clamp(v.targetFps as number, R(15, 144), d.targetFps),
    paused: typeof v.paused === 'boolean' ? v.paused : d.paused,
    quality: pickEnum<Quality>(v.quality, ['low', 'medium', 'high'], d.quality),
    rendererBackend: pickEnum<RendererBackend>(v.rendererBackend, ['auto', 'webgpu', 'webgl'], d.rendererBackend),
    capture: {
      resolution: pickEnum<CaptureResolution>(cap.resolution, ['display', '1080p', '1440p', '4k', 'custom'], d.capture.resolution),
      customWidth: Math.round(clamp(cap.customWidth as number, R(16, 7680), d.capture.customWidth)),
      customHeight: Math.round(clamp(cap.customHeight as number, R(16, 4320), d.capture.customHeight)),
      freezeOnCapture: typeof cap.freezeOnCapture === 'boolean' ? cap.freezeOnCapture : d.capture.freezeOnCapture,
      writeSidecarConfig: typeof cap.writeSidecarConfig === 'boolean' ? cap.writeSidecarConfig : d.capture.writeSidecarConfig,
    },
  };
}

function normalizePreset(input: unknown): LoomPreset | null {
  if (!isRecord(input)) return null;
  if (typeof input.id !== 'string' || typeof input.name !== 'string') return null;
  return {
    id: input.id,
    name: input.name,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    config: clampConfig(input.config),
    thumbnail: typeof input.thumbnail === 'string' ? input.thumbnail : undefined,
  };
}

export function normalizeLoomState(input: unknown): LoomState {
  if (!isRecord(input)) return structuredCloneState(DEFAULT_LOOM_STATE);
  const presets = Array.isArray(input.presets)
    ? input.presets.map(normalizePreset).filter((p): p is LoomPreset => p !== null)
    : [];
  return {
    version: 1,
    live: clampConfig(input.live),
    presets,
    settings: clampSettings(input.settings),
  };
}

// JSON round-trip is the simplest deep clone for our plain-object state.
export function structuredCloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── Deep-partial patch merge (what `loom_set` applies) ───────────

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type LoomConfigPatch = DeepPartial<LoomConfig>;

/**
 * Merge a partial config patch over a base config, then clamp the result.
 * Arrays (primitives) are replaced wholesale when present in the patch.
 */
export function mergeConfigPatch(base: LoomConfig, patch: unknown): LoomConfig {
  const p = isRecord(patch) ? patch : {};
  const merged: Record<string, unknown> = { ...base };

  for (const key of Object.keys(p)) {
    const incoming = p[key];
    const current = (base as unknown as Record<string, unknown>)[key];
    if (key === 'raymarch' && isRecord(incoming)) {
      // primitives array replaced wholesale; other raymarch scalars merged.
      const rc = isRecord(current) ? current : {};
      merged[key] = { ...rc, ...incoming };
    } else if (isRecord(incoming) && isRecord(current)) {
      merged[key] = { ...current, ...incoming };
    } else {
      merged[key] = incoming;
    }
  }

  return clampConfig(merged);
}

// ── Seeded RNG + random config generator (for `loom_random`) ────

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

export interface RandomOptions {
  paradigm?: Paradigm;
  seed?: number;
}

export function randomConfig(opts: RandomOptions = {}): LoomConfig {
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const rnd = mulberry32(seed);
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

  const paradigm: Paradigm = opts.paradigm ?? (rnd() > 0.5 ? 'particles' : 'raymarch');

  // Cosine palette with a coherent hue offset keeps colors harmonious.
  const baseHue: Vec3 = [range(0, 1), range(0, 1), range(0, 1)];
  const palette: Palette = {
    a: [0.5, 0.5, 0.5],
    b: [range(0.3, 0.55), range(0.3, 0.55), range(0.3, 0.55)],
    c: [range(0.6, 1.2), range(0.6, 1.2), range(0.6, 1.2)],
    d: baseHue,
  };

  const primCount = 1 + Math.floor(rnd() * 3);
  const primitives: SdfPrimitive[] = Array.from({ length: primCount }, () => ({
    shape: pick(['sphere', 'box', 'torus', 'capsule'] as const),
    position: [range(-1, 1), range(-1, 1), range(-0.6, 0.6)],
    scale: range(0.4, 1.2),
    morphAmount: range(0, 0.6),
    morphSpeed: range(0.2, 2),
  }));

  return clampConfig({
    paradigm,
    motion: { speed: range(0.5, 1.8), turbulence: range(0.2, 0.9), seed },
    palette,
    background: [range(0, 0.06), range(0, 0.06), range(0.01, 0.1)],
    particles: {
      count: pick([60_000, 150_000, 250_000, 500_000]),
      field: pick(['curl', 'lorenz', 'aizawa', 'gravity'] as const),
      fieldStrength: range(0.5, 1.8),
      noiseFrequency: range(0.2, 1.6),
      noiseEvolution: range(0.1, 1.2),
      pointSize: range(1, 4),
      trailFade: range(0.3, 0.9),
      colorMode: pick(['velocity', 'age', 'position'] as const),
    },
    raymarch: {
      primitives,
      blendSmoothness: range(0.2, 0.9),
      cameraDistance: range(2.5, 5.5),
      cameraOrbitSpeed: range(0, 0.8),
      glow: range(0.1, 0.7),
      fractalIterations: rnd() > 0.7 ? 1 + Math.floor(rnd() * 3) : 0,
    },
  });
}
