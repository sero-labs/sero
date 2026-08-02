/**
 * The compile stage: authored source to a loadable bundle, or errors the
 * author can act on. Every rejection is proven to fire — a compiler that
 * silently accepts garbage poisons the loop downstream.
 */
import { describe, expect, it } from 'vitest';

import { compilePuppetSource } from './compile';
import { CLEAN_SOURCE, FORBIDDEN_IMPORT_SOURCE, SYNTAX_ERROR_SOURCE } from './fixtures';

describe('compilePuppetSource', () => {
  it('bundles a valid character to CommonJS with the engine external', async () => {
    const result = await compilePuppetSource(CLEAN_SOURCE);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.code).toContain('require("@sero-ai/ink-and-bones")');
    expect(result.code).toContain('buildCharacter');
  });

  it('reports a syntax error with its line', async () => {
    const result = await compilePuppetSource(SYNTAX_ERROR_SOURCE);
    if (result.ok) throw new Error('a broken file compiled');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].line).toBeTypeOf('number');
  });

  it('refuses any import that is not the engine', async () => {
    const result = await compilePuppetSource(FORBIDDEN_IMPORT_SOURCE);
    if (result.ok) throw new Error('a foreign import compiled');
    expect(result.issues[0].text).toContain("'node:fs' cannot be imported");
    expect(result.issues[0].text).toContain('@sero-ai/ink-and-bones');
  });

  it('refuses a relative import — a character is one file', async () => {
    const result = await compilePuppetSource("import { x } from './helpers';\nexport const buildCharacter = () => x;");
    if (result.ok) throw new Error('a relative import compiled');
    expect(result.issues[0].text).toContain("'./helpers' cannot be imported");
  });

  it('refuses an empty file rather than emitting an empty bundle', async () => {
    const result = await compilePuppetSource('// nothing here\n');
    if (result.ok) throw new Error('an empty file compiled');
    expect(result.issues[0].text).toContain('compiled to nothing');
  });
});
