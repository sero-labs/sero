import type { BrowserViewBounds } from '@/types/browser';

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function normaliseZoomFactor(factor: number): number {
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

/** Convert renderer CSS coordinates into Electron BrowserWindow DIP bounds. */
export function toBrowserViewBounds(rect: RectLike, zoomFactor: number): BrowserViewBounds {
  const factor = normaliseZoomFactor(zoomFactor);
  return {
    x: Math.round(rect.left * factor),
    y: Math.round(rect.top * factor),
    width: Math.max(0, Math.round(rect.width * factor)),
    height: Math.max(0, Math.round(rect.height * factor)),
  };
}
