import { afterEach } from 'vitest';

/**
 * Shared test setup.
 *
 * This runs for every test file, node-side ones included, so it must not assume
 * a DOM: only the component tests carry `// @vitest-environment jsdom`, and
 * importing Testing Library unconditionally would pull a document into files
 * that have none.
 *
 * What it buys is unmounting between tests. Testing Library renders into a
 * container it appends to `document.body`, and without cleanup those containers
 * accumulate — so the second test in a file queries a document holding the
 * first test's markup as well as its own, and a `getByRole` that should find one
 * button finds two.
 */
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);

  // jsdom implements no layout, so it ships neither of these. Radix — which is
  // what `@sero-ai/ui` is built on — measures with both, so without them any
  // component containing a ScrollArea, a Select or a Dialog throws on render
  // and the failure looks nothing like its cause.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMRect ??= class {
    constructor(
      readonly x = 0,
      readonly y = 0,
      readonly width = 0,
      readonly height = 0,
    ) {}
    readonly top = 0;
    readonly left = 0;
    readonly right = 0;
    readonly bottom = 0;
    toJSON() {
      return {};
    }
    static fromRect() {
      return new DOMRect();
    }
  } as unknown as typeof DOMRect;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}
