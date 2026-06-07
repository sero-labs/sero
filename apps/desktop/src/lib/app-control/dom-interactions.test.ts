// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAppInteraction, getAppPanelRect } from './dom-interactions';

function makeRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setRect(element: Element, rect: DOMRect): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
}

function setPointStack(stack: Element[]): void {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => stack),
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => stack[0] ?? null),
  });
}

function setScrollMetrics(element: HTMLElement, values: { clientHeight: number; scrollHeight: number; scrollTop?: number }): void {
  let scrollTop = values.scrollTop ?? 0;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: values.clientHeight },
    scrollHeight: { configurable: true, value: values.scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(value, values.scrollHeight - values.clientHeight));
      },
    },
    clientWidth: { configurable: true, value: 200 },
    scrollWidth: { configurable: true, value: 200 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  });
  Object.defineProperty(element, 'scrollBy', {
    configurable: true,
    value: ({ top = 0 }: { top?: number }) => {
      element.scrollTop += top;
    },
  });
}

describe('app control DOM interactions', () => {
  let panel: HTMLElement;
  let button: HTMLButtonElement;
  let label: HTMLSpanElement;
  let link: HTMLAnchorElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-app-panel>
        <button id="save-button"><span id="save-label">Save changes</span></button>
        <a id="docs-link" role="link" aria-label="Docs">Docs</a>
      </div>
    `;

    panel = document.querySelector('[data-app-panel]') as HTMLElement;
    button = document.getElementById('save-button') as HTMLButtonElement;
    label = document.getElementById('save-label') as HTMLSpanElement;
    link = document.getElementById('docs-link') as HTMLAnchorElement;

    setRect(panel, makeRect(20, 40, 320, 240));
    setRect(button, makeRect(40, 60, 120, 36));
    setRect(label, makeRect(55, 68, 70, 18));
    setRect(link, makeRect(40, 120, 80, 24));
    setPointStack([label, button, panel]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('returns the app panel rect in renderer CSS pixels', () => {
    expect(getAppPanelRect()).toEqual({
      x: 20,
      y: 40,
      width: 320,
      height: 240,
    });
  });

  it('inspects a point relative to the panel and resolves the effective click target', async () => {
    const result = await executeAppInteraction({ action: 'inspect', x: 35, y: 28, captureAfter: false });

    expect(result.success).toBe(true);
    expect(result.inspection).toMatchObject({
      mode: 'point',
      point: { x: 35, y: 28 },
      panelRect: { x: 20, y: 40, width: 320, height: 240 },
      matched: {
        tagName: 'span',
        id: 'save-label',
        rect: { x: 35, y: 28, width: 70, height: 18 },
      },
      clickTarget: {
        tagName: 'button',
        id: 'save-button',
        rect: { x: 20, y: 20, width: 120, height: 36 },
      },
    });
    expect(result.inspection?.stack?.map((entry) => entry.id)).toEqual(['save-label', 'save-button', null]);
  });

  it('lists interactive elements with stable selector hints', async () => {
    const result = await executeAppInteraction({ action: 'inspect', captureAfter: false });

    expect(result.success).toBe(true);
    expect(result.inspection?.mode).toBe('interactive-list');
    expect(result.inspection?.interactives).toMatchObject([
      {
        id: 'save-button',
        tagName: 'button',
        selectorHint: '#save-button',
        interactive: true,
      },
      {
        id: 'docs-link',
        tagName: 'a',
        selectorHint: '#docs-link',
        interactive: true,
      },
    ]);
  });

  it('dispatches a full mouse click sequence for coordinate clicks', async () => {
    const events: string[] = [];
    for (const eventName of ['mousedown', 'mouseup', 'click']) {
      button.addEventListener(eventName, () => events.push(eventName));
    }

    const result = await executeAppInteraction({ action: 'click', x: 35, y: 28, captureAfter: false });

    expect(result).toMatchObject({
      success: true,
      message: 'Clicked at (35, 28)',
    });
    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
  });

  it('scrolls the nearest scroll container under a point and reports actual movement', async () => {
    const scroller = document.createElement('aside');
    scroller.className = 'factory-inspector';
    const child = document.createElement('div');
    child.textContent = 'Read-only evidence';
    scroller.appendChild(child);
    panel.appendChild(scroller);
    setRect(scroller, makeRect(180, 60, 120, 120));
    setRect(child, makeRect(190, 80, 80, 40));
    setScrollMetrics(scroller, { clientHeight: 120, scrollHeight: 2000, scrollTop: 420 });
    setPointStack([child, scroller, panel]);

    const result = await executeAppInteraction({ action: 'scroll', x: 180, y: 60, deltaY: 700, captureAfter: false });

    expect(result).toEqual({
      success: true,
      message: 'Scrolled aside.factory-inspector by y 700px; scrollTop 420 → 1120',
    });
  });
});
