// Top-level Loom state (v3). The visual model — a piece of multi-pass GLSL —
// lives in piece.ts. This file owns state, settings, creative direction,
// presets, and normalization with v1/v2 migration.

import {
  clonePiece,
  DEFAULT_PIECE,
  normalizePiece,
  type BuildError,
  type BuildReport,
  type LoomPiece,
  type SeeRequest,
  type SeeResult,
} from './piece';

export * from './piece';
export * from './glsl';

export type CaptureResolution = 'display' | '1080p' | '1440p' | '4k' | 'custom';

export interface CaptureSettings {
  resolution: CaptureResolution;
  customWidth: number;
  customHeight: number;
  freezeOnCapture: boolean;
  writeSidecarConfig: boolean;
}

export interface LoomSettings {
  /** Global time multiplier. */
  speed: number;
  /** Param tweens + piece cross-fades, in ms. */
  transitionMs: number;
  paused: boolean;
  capture: CaptureSettings;
}

/** Persistent creative direction the agent honors on every generation. */
export interface CreativeDirection {
  guidance: string;
}

export interface LoomPreset {
  id: string;
  name: string;
  createdAt: number;
  /** v3 pieces have shader code; presets migrated from v1/v2 carry legacyGraph instead. */
  piece?: LoomPiece;
  /** The old fixed-config/graph JSON, kept so the agent can recreate the look as a shader. */
  legacyGraph?: unknown;
  /** Small JPEG data URL, captured by the UI on save. */
  thumbnail?: string;
}

export interface LoomState {
  version: 3;
  piece: LoomPiece;
  /** Bumped on every piece write — the build-report handshake key. */
  revision: number;
  /** Written by the UI after each compile of `revision`. */
  build?: BuildReport;
  /** Transient: the agent asking the UI for frames (loom_see). */
  seeRequest?: SeeRequest;
  /** Transient: the extension acknowledging written frames. */
  seeResult?: SeeResult;
  direction: CreativeDirection;
  presets: LoomPreset[];
  settings: LoomSettings;
}

export const DEFAULT_SETTINGS: LoomSettings = {
  speed: 1,
  transitionMs: 1200,
  paused: false,
  capture: {
    resolution: 'display',
    customWidth: 2560,
    customHeight: 1440,
    freezeOnCapture: true,
    writeSidecarConfig: true,
  },
};

export const DEFAULT_LOOM_STATE: LoomState = {
  version: 3,
  piece: DEFAULT_PIECE,
  revision: 0,
  direction: { guidance: '' },
  presets: [],
  settings: DEFAULT_SETTINGS,
};

export function structuredCloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickStr<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function normalizeSettings(v: unknown, legacySpeed?: unknown): LoomSettings {
  const s = isRecord(v) ? v : {};
  const cap = isRecord(s.capture) ? s.capture : {};
  const d = DEFAULT_SETTINGS;
  return {
    speed: clampNum(s.speed ?? legacySpeed, 0, 4, d.speed),
    transitionMs: Math.round(clampNum(s.transitionMs, 0, 10_000, d.transitionMs)),
    paused: typeof s.paused === 'boolean' ? s.paused : d.paused,
    capture: {
      resolution: pickStr<CaptureResolution>(cap.resolution, ['display', '1080p', '1440p', '4k', 'custom'], d.capture.resolution),
      customWidth: Math.round(clampNum(cap.customWidth, 16, 7680, d.capture.customWidth)),
      customHeight: Math.round(clampNum(cap.customHeight, 16, 4320, d.capture.customHeight)),
      freezeOnCapture: typeof cap.freezeOnCapture === 'boolean' ? cap.freezeOnCapture : d.capture.freezeOnCapture,
      writeSidecarConfig: typeof cap.writeSidecarConfig === 'boolean' ? cap.writeSidecarConfig : d.capture.writeSidecarConfig,
    },
  };
}

function normalizePreset(v: unknown): LoomPreset | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const preset: LoomPreset = {
    id: v.id,
    name: v.name,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
  };
  if (isRecord(v.piece)) {
    preset.piece = normalizePiece(v.piece);
  } else {
    // v2 stored `graph`, v1 stored `config` — keep the JSON so the agent can recreate it.
    const legacy = v.legacyGraph ?? v.graph ?? v.config;
    if (legacy !== undefined) preset.legacyGraph = legacy;
  }
  if (typeof v.thumbnail === 'string' && v.thumbnail.startsWith('data:image/')) preset.thumbnail = v.thumbnail;
  return preset.piece || preset.legacyGraph ? preset : null;
}

function normalizeBuild(v: unknown): BuildReport | undefined {
  if (!isRecord(v) || typeof v.revision !== 'number' || (v.status !== 'ok' && v.status !== 'error')) return undefined;
  const errors: BuildError[] = Array.isArray(v.errors)
    ? v.errors
        .filter((e): e is Record<string, unknown> => isRecord(e) && typeof e.message === 'string')
        .map((e) => ({
          pass: pickStr(e.pass, ['A', 'B', 'C', 'D', 'image'] as const, 'image'),
          line: typeof e.line === 'number' ? e.line : null,
          message: String(e.message),
        }))
    : [];
  const report: BuildReport = { revision: v.revision, status: v.status, errors };
  if (typeof v.fps === 'number') report.fps = Math.round(v.fps);
  return report;
}

function normalizeSee(v: unknown): SeeRequest | undefined {
  if (!isRecord(v) || typeof v.id !== 'string') return undefined;
  return {
    id: v.id,
    frames: Math.round(clampNum(v.frames, 1, 3, 1)),
    spacingSeconds: clampNum(v.spacingSeconds, 0.1, 10, 2),
    width: Math.round(clampNum(v.width, 256, 1600, 768)),
  };
}

function normalizeSeeResult(v: unknown): SeeResult | undefined {
  if (!isRecord(v) || typeof v.id !== 'string' || !Array.isArray(v.paths)) return undefined;
  const result: SeeResult = { id: v.id, paths: v.paths.filter((p): p is string => typeof p === 'string') };
  if (typeof v.error === 'string') result.error = v.error;
  return result;
}

export function normalizeLoomState(input: unknown): LoomState {
  if (!isRecord(input)) return structuredCloneState(DEFAULT_LOOM_STATE);

  // v1 (`live` config) and v2 (`graph`) pieces are not renderable in v3 — the
  // live piece resets to the default; presets keep their legacy JSON (§8).
  const piece = isRecord(input.piece) ? normalizePiece(input.piece) : clonePiece(DEFAULT_PIECE);

  const presets = Array.isArray(input.presets)
    ? input.presets.map(normalizePreset).filter((p): p is LoomPreset => p !== null)
    : [];

  const legacySpeed = isRecord(input.graph) ? input.graph.speed : undefined;

  const state: LoomState = {
    version: 3,
    piece,
    revision: Math.max(0, Math.round(clampNum(input.revision, 0, Number.MAX_SAFE_INTEGER, 0))),
    direction: {
      guidance:
        isRecord(input.direction) && typeof input.direction.guidance === 'string' ? input.direction.guidance : '',
    },
    presets,
    settings: normalizeSettings(input.settings, legacySpeed),
  };
  const build = normalizeBuild(input.build);
  if (build) state.build = build;
  const seeRequest = normalizeSee(input.seeRequest);
  if (seeRequest) state.seeRequest = seeRequest;
  const seeResult = normalizeSeeResult(input.seeResult);
  if (seeResult) state.seeResult = seeResult;
  return state;
}
