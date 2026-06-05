// UI-side helpers: immutable graph/settings/direction recipes, capture sizing,
// palette preview.

import {
  normalizeGraph,
  normalizeLoomState,
  structuredCloneState,
  type LoomGraph,
  type LoomSettings,
  type LoomState,
  type Palette,
  type Vec3,
} from '../../shared/types';

type Updater = (updater: (prev: LoomState) => LoomState) => void;

export function updateGraph(updateState: Updater, recipe: (g: LoomGraph) => void): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const draft = structuredCloneState(s.graph);
    recipe(draft);
    return { ...s, graph: normalizeGraph(draft) };
  });
}

export function setGraph(updateState: Updater, graph: LoomGraph): void {
  updateState((prev) => ({ ...normalizeLoomState(prev), graph: normalizeGraph(graph) }));
}

export function updateSettings(updateState: Updater, recipe: (s: LoomSettings) => void): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const draft = structuredCloneState(s.settings);
    recipe(draft);
    return { ...s, settings: { ...s.settings, ...draft } };
  });
}

export function setDirection(updateState: Updater, guidance: string): void {
  updateState((prev) => ({ ...normalizeLoomState(prev), direction: { guidance } }));
}

export interface Dims {
  w: number;
  h: number;
}

export function captureDims(settings: LoomSettings): Dims {
  const cap = settings.capture;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  switch (cap.resolution) {
    case '1080p':
      return { w: 1920, h: 1080 };
    case '1440p':
      return { w: 2560, h: 1440 };
    case '4k':
      return { w: 3840, h: 2160 };
    case 'custom':
      return { w: cap.customWidth, h: cap.customHeight };
    case 'display':
    default:
      return {
        w: Math.round((globalThis.screen?.width || 1920) * dpr),
        h: Math.round((globalThis.screen?.height || 1080) * dpr),
      };
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function evalPalette(p: Palette, t: number): Vec3 {
  const ch = (i: number): number => clamp01(p.a[i] + p.b[i] * Math.cos(2 * Math.PI * (p.c[i] * t + p.d[i])));
  return [ch(0), ch(1), ch(2)];
}

export function paletteGradientCss(p: Palette, stops = 24): string {
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const [r, g, b] = evalPalette(p, t);
    parts.push(`rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0}) ${(t * 100) | 0}%`);
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
