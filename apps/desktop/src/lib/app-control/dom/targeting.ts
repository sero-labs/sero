const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, summary, label, [role="button"], [role="link"]';

export function findInPanel(panel: HTMLElement, selector: string): Element | null {
  return panel.querySelector(selector);
}

export function resolveClickTarget(panel: HTMLElement, target: Element | null): HTMLElement | null {
  if (!target || !panel.contains(target)) return null;
  const htmlTarget = target instanceof HTMLElement ? target : target.parentElement;
  if (!htmlTarget) return null;
  const interactive = htmlTarget.closest(INTERACTIVE_SELECTOR);
  if (interactive instanceof HTMLElement && panel.contains(interactive)) return interactive;
  return htmlTarget === panel ? null : htmlTarget;
}

export function getPanelStackAtPoint(panel: HTMLElement, clientX: number, clientY: number): Element[] {
  const stack = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter((value): value is Element => Boolean(value));
  return stack.filter((element): element is Element => panel.contains(element)).slice(0, 12);
}

export function isInteractiveElement(element: Element): boolean {
  return element.matches(INTERACTIVE_SELECTOR);
}

export function listInteractiveElements(panel: HTMLElement): Element[] {
  return Array.from(panel.querySelectorAll(INTERACTIVE_SELECTOR));
}
