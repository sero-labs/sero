/**
 * Regression test for the `--doctor` safe-mode contract.
 *
 * `electron/main.ts` MUST stay a tiny doctor-aware bootstrap. ESM
 * static imports are evaluated before any module-body code runs, so
 * any heavy import (especially `./platform/env`, `./ipc/*`, or any
 * `./features/*` outside the doctor subtree) at the top of main.ts
 * defeats the safe-mode contract — the doctor needs to survive
 * exactly the kinds of failures those modules trigger at load time.
 *
 * If you need to add another module to main.ts, please add it inside
 * the dynamic-import branches in `bootstrap()` instead and update this
 * test's allow-list with a short justification.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const MAIN_TS = path.resolve(__dirname, '../../../main.ts');

const ALLOWED_STATIC_IMPORTS = new Set<string>([
  // Electron is allowed so the sero-ext privileged scheme can be registered
  // synchronously before app readiness without importing the heavy app graph.
  'electron',
  // The doctor CLI module is self-contained (engine subtree only) and
  // touches no profile state, native modules, or feature initialisation.
  './features/doctor/cli',
]);

const FORBIDDEN_PATH_FRAGMENTS: Array<{ fragment: string; reason: string }> = [
  { fragment: './platform/env', reason: 'reads profiles.json at module load' },
  { fragment: './ipc', reason: 'pulls the entire IPC handler graph' },
  { fragment: './features/profile', reason: 'profile setup / migration code' },
  { fragment: './features/workspace', reason: 'workspace manager init' },
  { fragment: './features/container', reason: 'container infra init' },
  { fragment: './shared/infra', reason: 'shared infra construction' },
];

function extractStaticImports(source: string): string[] {
  // Strip block + line comments so commented-out imports don't trip us up.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out: string[] = [];
  const re = /^\s*import\s+[^'"]*?from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) out.push(m[1]);
  // Also catch bare side-effect imports: `import './foo';`
  const sideEffect = /^\s*import\s+['"]([^'"]+)['"]/gm;
  while ((m = sideEffect.exec(stripped)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

describe('electron/main.ts — safe-mode bootstrap shape', () => {
  const source = readFileSync(MAIN_TS, 'utf8');
  const imports = extractStaticImports(source);

  it('only statically imports Electron + the doctor CLI (and nothing heavy)', () => {
    const unexpected = imports.filter((i) => !ALLOWED_STATIC_IMPORTS.has(i));
    expect(unexpected, `Unexpected static imports in main.ts: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('does not statically import any module that runs profile or feature side effects at load', () => {
    for (const imp of imports) {
      for (const { fragment, reason } of FORBIDDEN_PATH_FRAGMENTS) {
        expect(
          imp.includes(fragment),
          `main.ts statically imports "${imp}" — forbidden because ${reason}`,
        ).toBe(false);
      }
    }
  });

  it('reaches the heavy app graph via a dynamic import of ./app-main', () => {
    expect(source).toMatch(/await\s+import\(['"]\.\/app-main['"]\)/);
  });

  it('registers the extension protocol scheme in the tiny bootstrap', () => {
    expect(source).toContain('protocol.registerSchemesAsPrivileged');
    expect(source).toContain("scheme: 'sero-ext'");
  });
});
