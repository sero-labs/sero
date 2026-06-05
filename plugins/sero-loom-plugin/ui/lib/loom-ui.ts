// Small UI-side helpers: immutable state recipes, capture sizing, palette preview.

import {
  clampConfig,
  normalizeLoomState,
  structuredCloneState,
  type LoomConfig,
  type LoomSettings,
  type LoomState,
  type Vec3,
} from '../../shared/types';

type Updater = (updater: (prev: LoomState) => LoomState) => void;

export function updateLive(updateState: Updater, recipe: (draft: LoomConfig) => void): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const draft = structuredCloneState(s.live);
    recipe(draft);
    return { ...s, live: clampConfig(draft) };
  });
}

export function updateSettings(updateState: Updater, recipe: (draft: LoomSettings) => void): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const draft = structuredCloneState(s.settings);
    recipe(draft);
    return { ...s, settings: { ...s.settings, ...draft } };
  });
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

/** Evaluate the IQ cosine palette on the CPU for UI previews. */
export function evalPalette(p: LoomConfig['palette'], t: number): Vec3 {
  const ch = (i: number): number =>
    clamp01(p.a[i] + p.b[i] * Math.cos(2 * Math.PI * (p.c[i] * t + p.d[i])));
  return [ch(0), ch(1), ch(2)];
}

export function paletteGradientCss(p: LoomConfig['palette'], stops = 24): string {
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const [r, g, b] = evalPalette(p, t);
    parts.push(`rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0}) ${((t * 100) | 0)}%`);
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export function rgbCss(v: Vec3): string {
  return `rgb(${(clamp01(v[0]) * 255) | 0},${(clamp01(v[1]) * 255) | 0},${(clamp01(v[2]) * 255) | 0})`;
}
