const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, summary, label, [role="button"], [role="link"]';
const TEXT_CANDIDATE_SELECTOR =
  'h1,h2,h3,h4,h5,h6,p,span,div,section,article,aside,button,a,label,summary,li,td,th,[role="heading"],[role="button"],[role="link"]';

export function findInPanel(panel: HTMLElement, selector: string): Element | null {
  return panel.querySelector(selector);
}

export function findSearchRoot(
  panel: HTMLElement,
  withinSelector?: string,
  containerText?: string,
): HTMLElement | null {
  if (withinSelector) {
    const element = findInPanel(panel, withinSelector);
    return element instanceof HTMLElement ? element : null;
  }
  if (!containerText) return panel;

  const label = findByText(panel, containerText);
  const container = label?.closest('aside,section,article,main,[role="region"],[role="main"],[role="complementary"],div');
  return container instanceof HTMLElement && panel.contains(container) ? container : null;
}

export function normaliseDomText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function isElementVisible(element: Element, root: HTMLElement): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) return false;
  if (rect.right <= rootRect.left || rect.left >= rootRect.right) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
}

export function findByText(panel: HTMLElement, text: string): Element | null {
  const needle = normaliseDomText(text).toLowerCase();
  if (!needle) return null;

  const matches = Array.from(panel.querySelectorAll(TEXT_CANDIDATE_SELECTOR))
    .filter((element) => normaliseDomText(element.textContent).toLowerCase().includes(needle));
  if (matches.length === 0) return null;

  return matches.sort((a, b) => {
    const aText = normaliseDomText(a.textContent).length;
    const bText = normaliseDomText(b.textContent).length;
    return aText - bText;
  })[0] ?? null;
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

export function buildElementLabel(element: Element): string {
  const id = element.getAttribute('id');
  if (id) return `#${id}`;
  const className = normaliseDomText(element.getAttribute('class'))
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => `.${part}`)
    .join('');
  if (className) return `${element.tagName.toLowerCase()}${className}`;
  return element.tagName.toLowerCase();
}

export function isSemanticContainer(element: Element): boolean {
  const className = normaliseDomText(element.getAttribute('class'));
  if (/inspector|node-list|run-list|sidebar|panel|drawer|list|content/i.test(className)) return true;
  return element.matches('aside,section,article,main,[role="region"],[role="main"],[role="complementary"]');
}
