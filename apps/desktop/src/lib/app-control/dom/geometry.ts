import type { AppPanelRect } from '@/types/ipc';

const APP_PANEL_SELECTOR = '[data-app-panel]';

export function getAppPanel(): HTMLElement | null {
  return document.querySelector(APP_PANEL_SELECTOR);
}

export function getAppPanelRect(): AppPanelRect | null {
  const panel = getAppPanel();
  if (!panel) return null;
  const rect = panel.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export function toAppPanelRect(rect: DOMRect): AppPanelRect {
  return {
    x: roundCoord(rect.left),
    y: roundCoord(rect.top),
    width: roundCoord(rect.width),
    height: roundCoord(rect.height),
  };
}
