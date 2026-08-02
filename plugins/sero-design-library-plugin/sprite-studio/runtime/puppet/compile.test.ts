/**
 * The compile stage: authored source to a worker bundle, or errors the
 * author can act on. Every rejection is proven to fire — a compiler that
 * silently accepts garbage poisons the loop downstream.
 */
import { describe, expect, it } from 'vitest';

import { compilePuppetWorker, type CompileResult } from './compile';
import { DETERMINISM_SOURCE, DRIVER_SOURCE } from './driver';
import { CLEAN_SOURCE, FORBIDDEN_IMPORT_SOURCE, SYNTAX_ERROR_SOURCE } from './fixtures';

function bundle(character: string): Promise<CompileResult> {
  return compilePuppetWorker({ character, driver: DRIVER_SOURCE, determinism: DETERMINISM_SOURCE });
}

describe('compilePuppetWorker', () => {
  it('bundles a valid character with the engine and the driver inside', async () => {
    const result = await bundle(CLEAN_SOURCE);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.code).toContain('buildCharacter');
    expect(result.code).toContain('parentPort');
    // The engine travels IN the bundle — the worker has no module resolution
    // of its own, and a shared engine instance would let one bake poison the
    // runtime's copy.
    expect(result.code).toContain('auditClip');
    // ESM output: no `require` in scope for authored code to reach Node with.
    expect(result.code).toContain('import');
  });

  it('reports a syntax error with its line in the authored file', async () => {
    const result = await bundle(SYNTAX_ERROR_SOURCE);
    if (result.ok) throw new Error('a broken file compiled');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].line).toBeTypeOf('number');
  });

  it('refuses any import that is not the engine', async () => {
    const result = await bundle(FORBIDDEN_IMPORT_SOURCE);
    if (result.ok) throw new Error('a foreign import compiled');
    expect(result.issues[0].text).toContain("'node:fs' cannot be imported");
    expect(result.issues[0].text).toContain('@sero-ai/ink-and-bones');
  });

  it('refuses a relative import — a character is one file', async () => {
    const result = await bundle("import { x } from './helpers';\nexport const buildCharacter = () => x;");
    if (result.ok) throw new Error('a relative import compiled');
    expect(result.issues[0].text).toContain("'./helpers' cannot be imported");
  });

  it("refuses the driver's own private modules from authored code", async () => {
    const result = await bundle("import './determinism';\nexport const buildCharacter = () => null;");
    if (result.ok) throw new Error('the character reached a driver module');
    expect(result.issues[0].text).toContain("'./determinism' cannot be imported");
  });

  it('an empty file compiles (the driver still bundles) — the contract stage catches it', async () => {
    // Compile alone cannot see a missing export; run.test proves the driver
    // fails it as 'contract' with the export named.
    const result = await bundle('// nothing here\n');
    expect(result.ok).toBe(true);
  });
});
