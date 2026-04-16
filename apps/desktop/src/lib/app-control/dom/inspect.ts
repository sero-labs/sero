import type {
  AppElementInfo,
  AppInteractionParams,
  AppInteractionResult,
} from '@/types/ipc';
import { roundCoord, toAppPanelRect } from './geometry';
import {
  findInPanel,
  getPanelStackAtPoint,
  isInteractiveElement,
  listInteractiveElements,
  resolveClickTarget,
} from './targeting';

function normaliseText(value: string | null | undefined, limit = 120): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildSelectorHint(element: Element): string | null {
  const id = element.getAttribute('id');
  if (id) return `#${cssEscape(id)}`;

  const dataTestId = element.getAttribute('data-testid');
  if (dataTestId) return `[data-testid="${cssEscape(dataTestId)}"]`;

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`;

  const title = element.getAttribute('title');
  if (title) return `${element.tagName.toLowerCase()}[title="${cssEscape(title)}"]`;

  const role = element.getAttribute('role');
  if (role) return `${element.tagName.toLowerCase()}[role="${cssEscape(role)}"]`;

  return null;
}

function describeElement(panelRect: DOMRect, element: Element | null): AppElementInfo | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.getAttribute('id'),
    className: normaliseText(element.getAttribute('class')),
    role: element.getAttribute('role'),
    ariaLabel: element.getAttribute('aria-label'),
    title: element.getAttribute('title'),
    text: normaliseText(element.textContent),
    value:
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? normaliseText(element.value)
        : null,
    rect: {
      x: roundCoord(rect.left - panelRect.left),
      y: roundCoord(rect.top - panelRect.top),
      width: roundCoord(rect.width),
      height: roundCoord(rect.height),
    },
    interactive: isInteractiveElement(element),
    selectorHint: buildSelectorHint(element),
  };
}

function describeInteractiveElements(panel: HTMLElement, panelRect: DOMRect): AppElementInfo[] {
  return listInteractiveElements(panel).flatMap((element) => {
    const info = describeElement(panelRect, element);
    if (!info || info.rect.width <= 0 || info.rect.height <= 0) return [];
    return [info];
  });
}

export function handleInspect(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const panelRect = panel.getBoundingClientRect();
  const appPanelRect = toAppPanelRect(panelRect);

  if (params.selector) {
    const element = findInPanel(panel, params.selector);
    if (!element) return { success: false, message: `No element found: ${params.selector}` };

    return {
      success: true,
      message: `Inspection complete for ${params.selector}`,
      inspection: {
        mode: 'selector',
        selector: params.selector,
        panelRect: appPanelRect,
        matched: describeElement(panelRect, element),
        clickTarget: describeElement(panelRect, resolveClickTarget(panel, element)),
        stack: [describeElement(panelRect, element)].filter((value): value is AppElementInfo => Boolean(value)),
      },
    };
  }

  if (params.x !== undefined && params.y !== undefined) {
    if (params.x < 0 || params.y < 0 || params.x > panelRect.width || params.y > panelRect.height) {
      return {
        success: false,
        message: `Coordinates (${params.x}, ${params.y}) are outside the app panel (${Math.round(panelRect.width)}×${Math.round(panelRect.height)} CSS px).`,
      };
    }

    const clientX = panelRect.left + params.x;
    const clientY = panelRect.top + params.y;
    const rawStack = getPanelStackAtPoint(panel, clientX, clientY);
    const matchedElement = rawStack[0] ?? null;
    const clickTargetElement = resolveClickTarget(panel, matchedElement);
    const stack = rawStack
      .map((element) => describeElement(panelRect, element))
      .filter((value): value is AppElementInfo => Boolean(value));

    return {
      success: true,
      message: `Inspection complete at (${params.x}, ${params.y})`,
      inspection: {
        mode: 'point',
        point: { x: roundCoord(params.x), y: roundCoord(params.y) },
        panelRect: appPanelRect,
        matched: describeElement(panelRect, matchedElement),
        clickTarget: describeElement(panelRect, clickTargetElement),
        stack,
      },
    };
  }

  const interactives = describeInteractiveElements(panel, panelRect);
  return {
    success: true,
    message: `Inspection complete (${interactives.length} interactive element${interactives.length === 1 ? '' : 's'})`,
    inspection: {
      mode: 'interactive-list',
      panelRect: appPanelRect,
      interactives,
    },
  };
}
