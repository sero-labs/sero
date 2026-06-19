import type { AppFullScreenshotTarget, AppPanelRect } from '@/types/ipc';
import { getElementByRef, getElementRef } from './refs';
import { buildElementLabel, findInPanel } from './targeting';

export interface ScreenshotPiece {
  y: number;
  dataUrl: string;
}

function rectToPanel(rect: DOMRect, panelRect: DOMRect): AppPanelRect {
  return {
    x: Math.round(rect.left - panelRect.left),
    y: Math.round(rect.top - panelRect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function positionsFor(element: HTMLElement): number[] {
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
  if (maxTop <= 0) return [element.scrollTop];
  const positions: number[] = [];
  const step = Math.max(1, element.clientHeight);
  for (let top = 0; top < maxTop; top += step) positions.push(top);
  if (positions.at(-1) !== maxTop) positions.push(maxTop);
  return positions;
}

export function prepareFullScreenshot(panel: HTMLElement, selector?: string): AppFullScreenshotTarget | null {
  const element = selector ? findInPanel(panel, selector) : panel;
  if (!(element instanceof HTMLElement)) return null;
  const panelRect = panel.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    ref: getElementRef(element),
    label: selector ?? buildElementLabel(element),
    rect: rectToPanel(rect, panelRect),
    scrollTop: element.scrollTop,
    scrollLeft: element.scrollLeft,
    scrollHeight: Math.round(element.scrollHeight),
    scrollWidth: Math.round(element.scrollWidth),
    clientHeight: Math.round(element.clientHeight),
    clientWidth: Math.round(element.clientWidth),
    positions: positionsFor(element),
  };
}

export function setFullScreenshotScroll(panel: HTMLElement, ref: string, scrollTop: number): boolean {
  const element = getElementByRef(panel, ref);
  if (!(element instanceof HTMLElement)) return false;
  element.scrollTop = scrollTop;
  return true;
}

export function restoreFullScreenshotScroll(panel: HTMLElement, ref: string, scrollTop: number, scrollLeft: number): boolean {
  const element = getElementByRef(panel, ref);
  if (!(element instanceof HTMLElement)) return false;
  element.scrollTop = scrollTop;
  element.scrollLeft = scrollLeft;
  return true;
}

export async function stitchFullScreenshot(
  target: AppFullScreenshotTarget,
  pieces: ScreenshotPiece[],
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, target.clientWidth);
  canvas.height = Math.max(1, target.scrollHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create screenshot canvas');

  for (const piece of pieces) {
    const image = await loadImage(piece.dataUrl);
    ctx.drawImage(image, 0, piece.y);
  }
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load screenshot piece'));
    image.src = dataUrl;
  });
}
