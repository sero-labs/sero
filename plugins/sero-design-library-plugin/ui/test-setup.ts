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
}
