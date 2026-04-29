import type {
  AppInteractionParams,
  AppInteractionResult,
} from '@/types/ipc';
import { findInPanel, resolveClickTarget } from './targeting';

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
  if (params.selector) {
    const target = resolveClickTarget(panel, findInPanel(panel, params.selector));
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

export function handleType(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (!params.text) return { success: false, message: 'Type action requires text' };

  let target: Element | null = null;
  if (params.selector) {
    target = findInPanel(panel, params.selector);
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
  if (!params.selector) return { success: false, message: 'Select requires a selector' };
  const element = findInPanel(panel, params.selector);
  if (!element) return { success: false, message: `No element found: ${params.selector}` };
  if (element instanceof HTMLElement) element.focus();
  return { success: true, message: `Selected: ${params.selector}` };
}

export function handleHover(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  if (!params.selector) return { success: false, message: 'Hover requires a selector' };
  const element = findInPanel(panel, params.selector);
  if (!element) return { success: false, message: `No element found: ${params.selector}` };
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { success: true, message: `Hovered: ${params.selector}` };
}

export function handleGetText(panel: HTMLElement, params: AppInteractionParams): AppInteractionResult {
  let target: Element = panel;
  if (params.selector) {
    const element = findInPanel(panel, params.selector);
    if (!element) return { success: false, message: `No element found: ${params.selector}` };
    target = element;
  }
  const text = target.textContent?.trim() ?? '';
  return { success: true, message: `Text content (${text.length} chars)`, textContent: text };
}
