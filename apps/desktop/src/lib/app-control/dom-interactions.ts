import type {
  AppElementInfo,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
} from '@/types/ipc';

const APP_PANEL_SELECTOR = '[data-app-panel]';
const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, summary, label, [role="button"], [role="link"]';

function getAppPanel(): HTMLElement | null {
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

function findInPanel(selector: string): Element | null {
  return getAppPanel()?.querySelector(selector) ?? null;
}

function toAppPanelRect(rect: DOMRect): AppPanelRect {
  return {
    x: roundCoord(rect.left),
    y: roundCoord(rect.top),
    width: roundCoord(rect.width),
    height: roundCoord(rect.height),
  };
}

function resolveClickTarget(panel: HTMLElement, target: Element | null): HTMLElement | null {
  if (!target || !panel.contains(target)) return null;
  const htmlTarget = target instanceof HTMLElement ? target : target.parentElement;
  if (!htmlTarget) return null;
  const interactive = htmlTarget.closest(INTERACTIVE_SELECTOR);
  if (interactive instanceof HTMLElement && panel.contains(interactive)) return interactive;
  return htmlTarget === panel ? null : htmlTarget;
}

function clickTarget(target: HTMLElement): void {
  target.focus({ preventScroll: true });
  target.click();
}

function clickTargetAt(target: HTMLElement, clientX: number, clientY: number): void {
  target.focus({ preventScroll: true });
  dispatchPointerMouseSequence(target, clientX, clientY);
}

function dispatchPointerMouseSequence(target: HTMLElement, clientX: number, clientY: number): void {
  const downInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  };
  const upInit = { ...downInit, buttons: 0 };

  if (typeof PointerEvent === 'function') {
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...downInit,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
  }

  target.dispatchEvent(new MouseEvent('mousedown', downInit));

  if (typeof PointerEvent === 'function') {
    target.dispatchEvent(
      new PointerEvent('pointerup', {
        ...upInit,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
  }

  target.dispatchEvent(new MouseEvent('mouseup', upInit));
  target.dispatchEvent(new MouseEvent('click', upInit));
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

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

function isInteractiveElement(element: Element): boolean {
  return element.matches(INTERACTIVE_SELECTOR);
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

function listInteractiveElements(panel: HTMLElement, panelRect: DOMRect): AppElementInfo[] {
  return Array.from(panel.querySelectorAll(INTERACTIVE_SELECTOR)).flatMap((element) => {
    const info = describeElement(panelRect, element);
    if (!info || info.rect.width <= 0 || info.rect.height <= 0) return [];
    return [info];
  });
}

function getPanelStackAtPoint(panel: HTMLElement, clientX: number, clientY: number): Element[] {
  const stack = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter((value): value is Element => Boolean(value));
  return stack.filter((element): element is Element => panel.contains(element)).slice(0, 12);
}

function handleClick(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (params.selector) {
    const target = resolveClickTarget(panel, findInPanel(params.selector));
    if (!target) return { success: false, message: `No element found: ${params.selector}` };
    clickTarget(target);
    return { success: true, message: `Clicked: ${params.selector}` };
  }

  if (params.x !== undefined && params.y !== undefined) {
    const rect = panel.getBoundingClientRect();
    if (params.x < 0 || params.y < 0 || params.x > rect.width || params.y > rect.height) {
      return {
        success: false,
        message: `Coordinates (${params.x}, ${params.y}) are outside the app panel (${Math.round(rect.width)}×${Math.round(rect.height)} CSS px).`,
      };
    }

    const clientX = rect.left + params.x;
    const clientY = rect.top + params.y;
    const target = resolveClickTarget(panel, document.elementFromPoint(clientX, clientY));
    if (!target) {
      return {
        success: false,
        message: `No clickable element in app panel at (${params.x}, ${params.y})`,
      };
    }

    clickTargetAt(target, clientX, clientY);
    return { success: true, message: `Clicked at (${params.x}, ${params.y})` };
  }

  return { success: false, message: 'Click requires selector or x,y coordinates' };
}

function handleType(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (!params.text) return { success: false, message: 'Type action requires text' };

  let target: Element | null = null;
  if (params.selector) {
    target = findInPanel(params.selector);
    if (!target) return { success: false, message: `No element found: ${params.selector}` };
    if (target instanceof HTMLElement) target.focus();
  } else {
    target = panel.contains(document.activeElement) ? document.activeElement : null;
    if (!target) return { success: false, message: 'No focused element. Use --selector.' };
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
    if (setter) {
      setter.call(target, target.value + params.text);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      target.value += params.text;
    }
    return { success: true, message: `Typed "${params.text}" into ${params.selector ?? 'focused element'}` };
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    document.execCommand('insertText', false, params.text);
    return { success: true, message: `Typed "${params.text}" into contenteditable` };
  }

  return { success: false, message: 'Target is not an input, textarea, or contenteditable' };
}

function handleScroll(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const direction = params.direction ?? 'down';
  const amount = params.amount ?? 300;
  let target: Element = panel;
  if (params.selector) {
    const element = findInPanel(params.selector);
    if (element) target = element;
  }
  const deltas: Record<string, [number, number]> = {
    up: [0, -amount],
    down: [0, amount],
    left: [-amount, 0],
    right: [amount, 0],
  };
  const [dx, dy] = deltas[direction] ?? [0, amount];
  target.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
  return { success: true, message: `Scrolled ${direction} by ${amount}px` };
}

function handleSelect(params: AppInteractionParams): AppInteractionResult {
  if (!params.selector) return { success: false, message: 'Select requires a selector' };
  const element = findInPanel(params.selector);
  if (!element) return { success: false, message: `No element found: ${params.selector}` };
  if (element instanceof HTMLElement) element.focus();
  return { success: true, message: `Selected: ${params.selector}` };
}

function handleHover(params: AppInteractionParams): AppInteractionResult {
  if (!params.selector) return { success: false, message: 'Hover requires a selector' };
  const element = findInPanel(params.selector);
  if (!element) return { success: false, message: `No element found: ${params.selector}` };
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { success: true, message: `Hovered: ${params.selector}` };
}

function handleGetText(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  let target: Element = panel;
  if (params.selector) {
    const element = findInPanel(params.selector);
    if (!element) return { success: false, message: `No element found: ${params.selector}` };
    target = element;
  }
  const text = target.textContent?.trim() ?? '';
  return { success: true, message: `Text content (${text.length} chars)`, textContent: text };
}

function handleInspect(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const panelRect = panel.getBoundingClientRect();
  const appPanelRect = toAppPanelRect(panelRect);

  if (params.selector) {
    const element = findInPanel(params.selector);
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

  const interactives = listInteractiveElements(panel, panelRect);
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

export async function executeAppInteraction(
  params: AppInteractionParams,
): Promise<AppInteractionResult> {
  const panel = getAppPanel();
  if (!panel) return { success: false, message: 'App panel not found in DOM' };

  switch (params.action) {
    case 'click':
      return handleClick(panel, params);
    case 'type':
      return handleType(panel, params);
    case 'scroll':
      return handleScroll(panel, params);
    case 'select':
      return handleSelect(params);
    case 'hover':
      return handleHover(params);
    case 'get-text':
      return handleGetText(panel, params);
    case 'inspect':
      return handleInspect(panel, params);
    default:
      return { success: false, message: `Unknown action: ${params.action}` };
  }
}

