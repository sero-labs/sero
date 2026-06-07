import type { AppInteractionParams, AppInteractionResult, AppScrollInfo } from '@/types/ipc';
import { roundCoord, toAppPanelRect } from './geometry';
import { buildSelectorHint } from './inspect';
import { getElementByRef, getElementRef } from './refs';
import {
  buildElementLabel,
  findByText,
  findInPanel,
  findSearchRoot,
  getPanelStackAtPoint,
  isElementVisible,
  isSemanticContainer,
} from './targeting';

function maxScrollTop(element: Element): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function maxScrollLeft(element: Element): number {
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

function canScroll(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const y = !/(hidden|clip)/.test(style.overflowY) && maxScrollTop(element) > 0;
  const x = !/(hidden|clip)/.test(style.overflowX) && maxScrollLeft(element) > 0;
  return x || y;
}

function scrollBy(element: HTMLElement, left: number, top: number): void {
  if (typeof element.scrollBy === 'function') {
    element.scrollBy({ left, top, behavior: 'auto' });
    return;
  }
  element.scrollLeft += left;
  element.scrollTop += top;
}

function nearestScrollContainer(panel: HTMLElement, element: Element | null): HTMLElement | null {
  let current = element instanceof HTMLElement ? element : element?.parentElement ?? null;
  while (current && panel.contains(current)) {
    if (canScroll(current)) return current;
    if (current === panel) break;
    current = current.parentElement;
  }
  return canScroll(panel) ? panel : null;
}

function scrollInfo(panelRect: DOMRect, element: HTMLElement): AppScrollInfo {
  const rect = element.getBoundingClientRect();
  return {
    ref: getElementRef(element),
    selectorHint: buildSelectorHint(element),
    label: buildElementLabel(element),
    rect: {
      x: roundCoord(rect.left - panelRect.left),
      y: roundCoord(rect.top - panelRect.top),
      width: roundCoord(rect.width),
      height: roundCoord(rect.height),
    },
    scrollTop: Math.round(element.scrollTop),
    scrollLeft: Math.round(element.scrollLeft),
    maxScrollTop: Math.round(maxScrollTop(element)),
    maxScrollLeft: Math.round(maxScrollLeft(element)),
    clientHeight: Math.round(element.clientHeight),
    clientWidth: Math.round(element.clientWidth),
    scrollHeight: Math.round(element.scrollHeight),
    scrollWidth: Math.round(element.scrollWidth),
  };
}

function resolveTarget(panel: HTMLElement, params: AppInteractionParams): Element | null {
  if (params.ref) return getElementByRef(panel, params.ref);
  if (params.selector) return findInPanel(panel, params.selector);
  if (params.text) {
    const root = findSearchRoot(panel, params.withinSelector, params.containerText);
    return root ? findByText(root, params.text) : null;
  }
  if (params.x !== undefined && params.y !== undefined) {
    const panelRect = panel.getBoundingClientRect();
    const clientX = panelRect.left + params.x;
    const clientY = panelRect.top + params.y;
    return getPanelStackAtPoint(panel, clientX, clientY)[0] ?? null;
  }
  return panel;
}

function deltaFromParams(params: AppInteractionParams): { dx: number; dy: number } {
  if (params.deltaX !== undefined || params.deltaY !== undefined) {
    return { dx: params.deltaX ?? 0, dy: params.deltaY ?? 0 };
  }
  const amount = params.amount ?? 300;
  switch (params.direction ?? 'down') {
    case 'up': return { dx: 0, dy: -amount };
    case 'left': return { dx: -amount, dy: 0 };
    case 'right': return { dx: amount, dy: 0 };
    case 'down':
    default: return { dx: 0, dy: amount };
  }
}

function missingTargetMessage(params: AppInteractionParams): string {
  if (params.ref) return `No element found for ref: ${params.ref}`;
  if (params.selector) return `No element found: ${params.selector}`;
  if (params.text) return `No element found containing text: ${params.text}`;
  return 'No element found at scroll point';
}

export function handleScroll(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const target = resolveTarget(panel, params);
  if (!target) return { success: false, message: missingTargetMessage(params) };

  const scroller = nearestScrollContainer(panel, target);
  if (!scroller) {
    const selected = buildElementLabel(target);
    return { success: false, message: `No scroll occurred; ${selected} is not inside a scrollable container.` };
  }

  const { dx, dy } = deltaFromParams(params);
  const beforeTop = scroller.scrollTop;
  const beforeLeft = scroller.scrollLeft;
  scrollBy(scroller, dx, dy);
  const afterTop = scroller.scrollTop;
  const afterLeft = scroller.scrollLeft;
  const label = buildElementLabel(scroller);

  if (beforeTop === afterTop && beforeLeft === afterLeft) {
    return {
      success: false,
      message: `No scroll occurred; ${label} scrollTop ${Math.round(beforeTop)} of ${maxScrollTop(scroller)}.`,
    };
  }

  const pieces = [
    dx ? `x ${Math.round(dx)}px; scrollLeft ${Math.round(beforeLeft)} → ${Math.round(afterLeft)}` : null,
    dy ? `y ${Math.round(dy)}px; scrollTop ${Math.round(beforeTop)} → ${Math.round(afterTop)}` : null,
  ].filter(Boolean).join('; ');
  return { success: true, message: `Scrolled ${label} by ${pieces}` };
}

export function handleScrollTo(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const target = resolveTarget(panel, params);
  if (!target) return { success: false, message: missingTargetMessage(params) };
  if (!(target instanceof HTMLElement)) return { success: false, message: 'Target cannot be scrolled into view' };

  const scroller = nearestScrollContainer(panel, target.parentElement ?? target);
  if (!scroller) return { success: false, message: `No scrollable container found for ${buildElementLabel(target)}` };

  const beforeTop = scroller.scrollTop;
  const targetRect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const offset = targetRect.top - scrollerRect.top - (scroller.clientHeight / 2) + (targetRect.height / 2);
  scrollBy(scroller, 0, offset);
  const updatedTargetRect = target.getBoundingClientRect();
  const visible = isElementVisible(target, panel);
  const targetBounds = [
    `x ${Math.round(updatedTargetRect.left - panel.getBoundingClientRect().left)}`,
    `y ${Math.round(updatedTargetRect.top - panel.getBoundingClientRect().top)}`,
    `w ${Math.round(updatedTargetRect.width)}`,
    `h ${Math.round(updatedTargetRect.height)}`,
  ].join(', ');

  return {
    success: true,
    message: `Scrolled ${buildElementLabel(scroller)} to ${buildElementLabel(target)}; scrollTop ${Math.round(beforeTop)} → ${Math.round(scroller.scrollTop)}; visible: ${visible}; target rect: ${targetBounds}`,
  };
}

export function handleScrollContainers(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const panelRect = panel.getBoundingClientRect();
  const limit = params.limit ?? 80;
  const containers = [panel, ...Array.from(panel.querySelectorAll('*'))]
    .filter((element): element is HTMLElement => element instanceof HTMLElement && canScroll(element))
    .filter((element) => !params.visibleOnly || isElementVisible(element, panel))
    .sort((a, b) => Number(isSemanticContainer(b)) - Number(isSemanticContainer(a)))
    .slice(0, limit)
    .map((element) => scrollInfo(panelRect, element));
  return {
    success: true,
    message: `Found ${containers.length} scroll container${containers.length === 1 ? '' : 's'}`,
    scrollContainers: containers,
  };
}

export function getFullScreenshotTarget(panel: HTMLElement, selector?: string): AppInteractionResult & { target?: AppScrollInfo } {
  const element = selector ? findInPanel(panel, selector) : panel;
  if (!element) return { success: false, message: `No element found: ${selector}` };
  if (!(element instanceof HTMLElement)) return { success: false, message: 'Target is not an HTML element' };
  const panelRect = panel.getBoundingClientRect();
  return { success: true, message: 'Full screenshot target ready', target: scrollInfo(panelRect, element) };
}

export function getFullScreenshotPositions(element: HTMLElement): number[] {
  const maxTop = maxScrollTop(element);
  if (maxTop <= 0) return [element.scrollTop];
  const step = Math.max(1, element.clientHeight);
  const positions: number[] = [];
  for (let y = 0; y < maxTop; y += step) positions.push(y);
  if (positions.at(-1) !== maxTop) positions.push(maxTop);
  return positions;
}

export function toPanelRect(rect: AppScrollInfo): ReturnType<typeof toAppPanelRect> {
  return { x: rect.rect.x, y: rect.rect.y, width: rect.rect.width, height: rect.rect.height };
}
