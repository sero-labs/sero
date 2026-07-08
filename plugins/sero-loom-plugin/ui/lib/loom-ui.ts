// UI-side state recipes (all piece writes bump `revision` — the build-report
// handshake key), capture sizing, and small helpers.

import {
  normalizeLoomState,
  normalizePiece,
  structuredCloneState,
  type BuildReport,
  type LoomPiece,
  type LoomSettings,
  type LoomState,
  type ParamValue,
} from '../../shared/types';

export type Updater = (updater: (prev: LoomState) => LoomState) => void;

export function setPiece(updateState: Updater, piece: LoomPiece): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    return { ...s, piece: normalizePiece(piece), revision: s.revision + 1 };
  });
}

export function setParamValues(updateState: Updater, values: Record<string, ParamValue>): void {
  // Param VALUE changes tween as uniforms and never recompile, so they must NOT
  // bump `revision` — that key is the compile/build-report handshake. Bumping it
  // on slider drags spammed build writes and let a stale UI write false-match a
  // concurrent agent compose (reporting success while discarding the new piece).
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const piece = normalizePiece({ ...s.piece, paramValues: { ...s.piece.paramValues, ...values } });
    return { ...s, piece };
  });
}

export function writeBuild(updateState: Updater, build: BuildReport): void {
  updateState((prev) => ({ ...normalizeLoomState(prev), build }));
}

export function writeSeeError(updateState: Updater, id: string, error: string): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const next = { ...s, seeResult: { id, paths: [], error } };
    if (next.seeRequest?.id === id) delete next.seeRequest;
    return next;
  });
}

export function updateSettings(updateState: Updater, recipe: (s: LoomSettings) => void): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const draft = structuredCloneState(s.settings);
    recipe(draft);
    return { ...s, settings: draft };
  });
}

export function setDirection(updateState: Updater, guidance: string): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    return s.direction.guidance === guidance ? prev : { ...s, direction: { guidance } };
  });
}

export function savePreset(updateState: Updater, name: string, thumbnail?: string): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const id = `piece-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    const preset = { id, name, createdAt: Date.now(), piece: structuredCloneState(s.piece), ...(thumbnail ? { thumbnail } : {}) };
    return { ...s, presets: [...s.presets, preset] };
  });
}

export function loadPreset(updateState: Updater, id: string): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    const p = s.presets.find((x) => x.id === id);
    if (!p?.piece) return s;
    return { ...s, piece: normalizePiece(structuredCloneState(p.piece)), revision: s.revision + 1 };
  });
}

export function deletePreset(updateState: Updater, id: string): void {
  updateState((prev) => {
    const s = normalizeLoomState(prev);
    return { ...s, presets: s.presets.filter((x) => x.id !== id) };
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

const hex = (c: number): string =>
  Math.round(Math.min(1, Math.max(0, c)) * 255)
    .toString(16)
    .padStart(2, '0');

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function hexToRgb(value: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
