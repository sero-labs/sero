/**
 * The engine boundary, asserted rather than trusted (plan §1, item 9).
 *
 * The whole feature rests on this file. `pixel-engine/` may be imported by the
 * plugin, the UI and one day a game, and it may import nothing back — no
 * dependency, no Node API, no React, no plugin module. A convenient import is
 * the easiest thing in the world to add and the hardest to remove later, so the
 * build fails the moment one appears.
 *
 * The same scan covers the compile path's other promise: no clock and no random
 * numbers, because a compile that reads either cannot be deterministic.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_ROOT = __dirname;

/**
 * Every source file of the engine, tests aside.
 *
 * Every runtime extension, not only `.ts`: a single `.js` helper dropped in here
 * would otherwise import whatever it liked and the scan would never see it.
 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

function engineFiles(): string[] {
  return readdirSync(ENGINE_ROOT, { recursive: true, encoding: 'utf8' })
    .filter((entry) => SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension)) && !/\.test\.[cm]?[jt]sx?$/.test(entry))
    .map((entry) => path.join(ENGINE_ROOT, entry));
}

/**
 * The file with its comments taken out.
 *
 * The engine's comments talk *about* the rules — "nothing reads a clock", "fills
 * the context window" — so scanning the raw text finds the documentation rather
 * than a violation. The `[^:]` guard keeps a `https://` URL out of the line-comment
 * rule.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every module specifier a file imports, however it phrases it. */
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/(?:\bfrom|^\s*import|\brequire\(|\bimport\()\s*\(?\s*['"]([^'"]+)['"]/gm)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

describe('the engine imports nothing outside itself', () => {
  it('has files to check', () => {
    expect(engineFiles().length).toBeGreaterThan(10);
  });

  it.each(engineFiles().map((file) => [path.relative(ENGINE_ROOT, file), file]))('%s', (_name, file) => {
    const source = code(readFileSync(file, 'utf8'));
    for (const specifier of importsOf(source)) {
      // A bare specifier is a package; `node:` is a platform API. Both are out.
      expect(specifier.startsWith('.'), `imports "${specifier}", which is not part of the engine`).toBe(true);
      const resolved = resolveImport(file, specifier);
      expect(resolved, `imports "${specifier}", which is not a file`).not.toBeNull();
      expect(resolved?.startsWith(realpathSync(ENGINE_ROOT) + path.sep), `imports "${specifier}", which is outside pixel-engine/`).toBe(true);
    }
    // A computed specifier is a hole in the scan above, so it is a fault by
    // itself: the engine has no reason to decide an import at runtime.
    expect(/\bimport\s*\(\s*[^'")]/.test(source), 'builds an import specifier at runtime, which this scan cannot follow').toBe(false);
  });
});

/**
 * The real file an import points at, or null if there is none.
 *
 * `realpathSync` is what closes the last hole: a symlink inside `pixel-engine/`
 * pointing at plugin code would otherwise resolve to a local-looking path.
 */
function resolveImport(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => base + extension), ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`))];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return found === undefined ? null : realpathSync(found);
}

describe('no compile path reads a clock or a random number', () => {
  it.each(engineFiles().map((file) => [path.relative(ENGINE_ROOT, file), file]))('%s', (_name, file) => {
    const source = code(readFileSync(file, 'utf8'));
    for (const forbidden of ['Date.now', 'new Date', 'Math.random', 'performance.now', 'process.', 'globalThis.', 'window.', 'document.']) {
      expect(source.includes(forbidden), `uses ${forbidden}, which the engine cannot depend on`).toBe(false);
    }
  });
});
