const refByElement = new WeakMap<Element, string>();
const elementByRef = new Map<string, Element>();
let nextRefId = 1;

export function getElementRef(element: Element): string {
  const existing = refByElement.get(element);
  if (existing) return existing;
  const ref = `e${nextRefId++}`;
  refByElement.set(element, ref);
  elementByRef.set(ref, element);
  return ref;
}

export function getElementByRef(panel: HTMLElement, ref: string): Element | null {
  const element = elementByRef.get(ref) ?? null;
  if (!element || !panel.contains(element) || !element.isConnected) return null;
  return element;
}
