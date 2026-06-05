// Top-level Loom state (v2). The visual model lives in graph.ts; the expression
// language in expr.ts. This file owns state, settings, creative direction, and
// presets, plus normalization with v1 migration.

import {
  DEFAULT_GRAPH,
  type LoomGraph,
  migrateLegacyConfig,
  normalizeGraph,
} from './graph';

export * from './graph';
export * from './expr';

export type Quality = 'low' | 'medium' | 'high';
export type RendererBackend = 'auto' | 'webgpu' | 'webgl';
export type CaptureResolution = 'display' | '1080p' | '1440p' | '4k' | 'custom';

export interface CaptureSettings {
  resolution: CaptureResolution;
  customWidth: number;
  customHeight: number;
  freezeOnCapture: boolean;
  writeSidecarConfig: boolean;
}

export interface LoomSettings {
  transitionMs: number;
  paused: boolean;
  quality: Quality;
  rendererBackend: RendererBackend;
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
  graph: LoomGraph;
}

export interface LoomState {
  version: 2;
  graph: LoomGraph;
  direction: CreativeDirection;
  presets: LoomPreset[];
  settings: LoomSettings;
}

export const DEFAULT_SETTINGS: LoomSettings = {
  transitionMs: 1200,
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

export const DEFAULT_DIRECTION: CreativeDirection = {
  guidance: '',
};

export const DEFAULT_LOOM_STATE: LoomState = {
  version: 2,
  graph: DEFAULT_GRAPH,
  direction: DEFAULT_DIRECTION,
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

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function normalizeSettings(v: unknown): LoomSettings {
  const s = isRecord(v) ? v : {};
  const cap = isRecord(s.capture) ? s.capture : {};
  const d = DEFAULT_SETTINGS;
  return {
    transitionMs: clampInt(s.transitionMs, 0, 10_000, d.transitionMs),
    paused: typeof s.paused === 'boolean' ? s.paused : d.paused,
    quality: pickStr<Quality>(s.quality, ['low', 'medium', 'high'], d.quality),
    rendererBackend: pickStr<RendererBackend>(s.rendererBackend, ['auto', 'webgpu', 'webgl'], d.rendererBackend),
    capture: {
      resolution: pickStr<CaptureResolution>(cap.resolution, ['display', '1080p', '1440p', '4k', 'custom'], d.capture.resolution),
      customWidth: clampInt(cap.customWidth, 16, 7680, d.capture.customWidth),
      customHeight: clampInt(cap.customHeight, 16, 4320, d.capture.customHeight),
      freezeOnCapture: typeof cap.freezeOnCapture === 'boolean' ? cap.freezeOnCapture : d.capture.freezeOnCapture,
      writeSidecarConfig: typeof cap.writeSidecarConfig === 'boolean' ? cap.writeSidecarConfig : d.capture.writeSidecarConfig,
    },
  };
}

function normalizePreset(v: unknown): LoomPreset | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  // v1 presets stored `config`; migrate those to a graph.
  const graph = v.graph !== undefined ? normalizeGraph(v.graph) : migrateLegacyConfig(v.config);
  return {
    id: v.id,
    name: v.name,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    graph,
  };
}

export function normalizeLoomState(input: unknown): LoomState {
  if (!isRecord(input)) return structuredCloneState(DEFAULT_LOOM_STATE);

  // Migrate v1 (which had `live: LoomConfig`) → v2 graph.
  const graph =
    input.graph !== undefined
      ? normalizeGraph(input.graph)
      : input.live !== undefined
        ? migrateLegacyConfig(input.live)
        : structuredCloneState(DEFAULT_GRAPH);

  const presets = Array.isArray(input.presets)
    ? input.presets.map(normalizePreset).filter((p): p is LoomPreset => p !== null)
    : [];

  const direction: CreativeDirection = {
    guidance:
      isRecord(input.direction) && typeof input.direction.guidance === 'string'
        ? input.direction.guidance
        : '',
  };

  return {
    version: 2,
    graph,
    direction,
    presets,
    settings: normalizeSettings(input.settings),
  };
}
