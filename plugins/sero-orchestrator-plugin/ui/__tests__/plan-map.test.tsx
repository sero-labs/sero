// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { previewLoop } from '../__preview__/fixture';
import { PlanMap } from '../components/PlanMap';

describe('PlanMap', () => {
  it.each([1, 2, 3, 4] as const)(
    'keeps narrow map content available with %i step(s) per row',
    (stepsPerRow) => {
      const markup = renderToStaticMarkup(<PlanMap loop={previewLoop} stepsPerRow={stepsPerRow} />);

      expect(markup).toContain('overflow-x-auto');
    },
  );

  it('exposes connector labels outside the decorative SVG', async () => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1160);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<PlanMap loop={previewLoop} stepsPerRow={4} />));

    const connections = container.querySelector('[aria-label="Plan connections"]');
    expect(connections).not.toBeNull();
    expect(connections?.textContent).toContain('wraps to the next row');
    expect(connections?.textContent).toContain('loop back to 6 · 1 of 3 used');

    await act(async () => root.unmount());
    container.remove();
    width.mockRestore();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
});
