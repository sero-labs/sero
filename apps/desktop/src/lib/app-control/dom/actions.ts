import type {
  AppInteractionParams,
  AppInteractionResult,
} from '@/types/ipc';
import { getElementByRef } from './refs';
import {
  findByText,
  findInPanel,
  findSearchRoot,
  isElementVisible,
  normaliseDomText,
  resolveClickTarget,
} from './targeting';

function findTarget(panel: HTMLElement, params: AppInteractionParams): Element | null {
  if (params.ref) return getElementByRef(panel, params.ref);
  if (params.selector) return findInPanel(panel, params.selector);
  if (params.text) {
    const root = findSearchRoot(panel, params.withinSelector, params.containerText);
    return root ? findByText(root, params.text) : null;
  }
  return null;
}

function targetLabel(params: AppInteractionParams): string {
  return params.selector ?? params.ref ?? params.text ?? 'target';
}

function clickTarget(target: HTMLElement): void {
  target.focus({ preventScroll: true });
  target.click();
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

function clickTargetAt(target: HTMLElement, clientX: number, clientY: number): void {
  target.focus({ preventScroll: true });
  dispatchPointerMouseSequence(target, clientX, clientY);
}

export function handleClick(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (params.selector || params.ref || params.text) {
    const target = resolveClickTarget(panel, findTarget(panel, params));
    if (!target) return { success: false, message: `No element found: ${targetLabel(params)}` };
    clickTarget(target);
    return { success: true, message: `Clicked: ${targetLabel(params)}` };
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

export function handleType(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (!params.text) return { success: false, message: 'Type action requires text' };

  let target: Element | null = null;
  if (params.selector || params.ref) {
    target = findTarget(panel, params);
    if (!target) return { success: false, message: `No element found: ${targetLabel(params)}` };
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
    return { success: true, message: `Typed "${params.text}" into ${targetLabel(params)}` };
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    document.execCommand('insertText', false, params.text);
    return { success: true, message: `Typed "${params.text}" into contenteditable` };
  }

  return { success: false, message: 'Target is not an input, textarea, or contenteditable' };
}

export function handleScroll(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  const direction = params.direction ?? 'down';
  const amount = params.amount ?? 300;
  let target: Element = panel;
  if (params.selector) {
    const element = findInPanel(panel, params.selector);
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

export function handleSelect(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (!params.selector && !params.ref) return { success: false, message: 'Select requires a selector or ref' };
  const element = findTarget(panel, params);
  if (!element) return { success: false, message: `No element found: ${targetLabel(params)}` };
  if (element instanceof HTMLElement) element.focus();
  return { success: true, message: `Selected: ${targetLabel(params)}` };
}

export function handleHover(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (!params.selector && !params.ref) return { success: false, message: 'Hover requires a selector or ref' };
  const element = findTarget(panel, params);
  if (!element) return { success: false, message: `No element found: ${targetLabel(params)}` };
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { success: true, message: `Hovered: ${targetLabel(params)}` };
}

export function handleGetText(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  let target: Element = panel;
  if (params.selector || params.ref) {
    const element = findTarget(panel, params);
    if (!element) return { success: false, message: `No element found: ${targetLabel(params)}` };
    target = element;
  }

  if (params.aroundText) {
    const root = findSearchRoot(
      target instanceof HTMLElement ? target : panel,
      params.withinSelector,
      params.containerText,
    );
    const element = root ? findByText(root, params.aroundText) : null;
    if (!element) return { success: false, message: `No text found around: ${params.aroundText}` };
    target = element;
  }

  const text = params.visibleOnly && target instanceof HTMLElement
    ? Array.from(target.querySelectorAll('*'))
      .filter((element) => isElementVisible(element, panel))
      .map((element) => normaliseDomText(element.textContent))
      .filter(Boolean)
      .join('\n')
    : target.textContent?.trim() ?? '';
  return { success: true, message: `Text content (${text.length} chars)`, textContent: text };
}
