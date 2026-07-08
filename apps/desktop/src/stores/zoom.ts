/**
 * Zoom store — page zoom with a zoom-invariant chrome.
 *
 * The zoom factor applies to the whole page via webFrame, while the
 * title/status bars counter-scale through the `--zoom-factor` CSS
 * variable (see `.chrome-zoom-invariant` in global.css), so the chrome
 * renders at a constant physical size and native window controls stay
 * aligned at every zoom level.
 *
 * Driven by the View menu (accelerators arrive as zoom commands over
 * IPC) and the status-bar zoom control. Persisted as `zoomFactor`.
 */

import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import type { ZoomCommand } from '@/types/window-chrome';

export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function clampZoom(factor: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
}

function applyZoom(factor: number): void {
  window.sero.window.setZoomFactor(factor);
  document.documentElement.style.setProperty('--zoom-factor', String(factor));
}

interface ZoomState {
  factor: number;
  setFactor: (factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useZoomStore = create<ZoomState>((set, get) => ({
  factor: 1,
  setFactor: (factor) => {
    const next = clampZoom(factor);
    if (next === get().factor) return;
    applyZoom(next);
    set({ factor: next });
    persistLayout({ zoomFactor: next });
  },
  zoomIn: () => {
    const next = ZOOM_STEPS.find((step) => step > get().factor + 0.001);
    if (next !== undefined) get().setFactor(next);
  },
  zoomOut: () => {
    const lower = ZOOM_STEPS.filter((step) => step < get().factor - 0.001);
    if (lower.length > 0) get().setFactor(lower[lower.length - 1]);
  },
  resetZoom: () => get().setFactor(1),
}));

/** Hydrate from layout state. Call once on startup. */
export function hydrateZoom(zoomFactor: number | undefined): void {
  if (typeof zoomFactor !== 'number' || !Number.isFinite(zoomFactor)) return;
  const factor = clampZoom(zoomFactor);
  if (factor === 1) return;
  applyZoom(factor);
  useZoomStore.setState({ factor });
}

/** Subscribe to zoom commands from the application menu. Returns unsubscribe. */
export function listenForZoomCommands(): () => void {
  return window.sero.window.onZoomCommand((command: ZoomCommand) => {
    const store = useZoomStore.getState();
    if (command === 'in') store.zoomIn();
    else if (command === 'out') store.zoomOut();
    else store.resetZoom();
  });
}
