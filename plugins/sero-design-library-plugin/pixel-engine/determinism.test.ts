/**
 * The same project makes the same pixels — twice, and in another process
 * (plan item 10, spec §9).
 *
 * Everything downstream leans on this. A kept sprite is only immutable if a
 * recompile gives back the bytes it recorded; an export can only verify its
 * checksums if the checksums are reproducible; a hash is only a receipt if it
 * changes when, and only when, the art changes.
 *
 * The second process is not paranoia. Compilation runs in the plugin runtime, in
 * the browser UI and, one day, in a game, and a compiler that quietly depends on
 * its host — a platform zlib, an ambient locale, an object key order — passes
 * every single-process test there is.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

import { compileProject, type CompileOptions } from './compile';
import { sha256Hex } from './hash';
import { knightProject } from './testing/fixtures';

/** The options the golden sheet was compiled with. Changing them changes the golden. */
const GOLDEN_OPTIONS: CompileOptions = { scale: 1, padding: 1, extrude: 1, image: 'sheet.png' };
const GOLDEN_SHEET = path.join(__dirname, 'testing', 'golden', 'knight-sheet.png');

describe('compiling twice', () => {
  it('gives byte-identical pixels and the same hash', () => {
    const first = compileProject(knightProject(), GOLDEN_OPTIONS);
    const second = compileProject(knightProject(), GOLDEN_OPTIONS);
    expect(second.png).toEqual(first.png);
    expect(second.hash).toBe(first.hash);
  });

  it('gives a different hash when the art changes, and only then', () => {
    const before = compileProject(knightProject(), GOLDEN_OPTIONS);
    const moved = knightProject();
    moved.frames[1].placements[0] = { ...moved.frames[1].placements[0], dx: 2 };
    expect(compileProject(moved, GOLDEN_OPTIONS).hash).not.toBe(before.hash);

    const renamed = knightProject();
    renamed.palette.colours[2].name = 'flesh';
    expect(compileProject(renamed, GOLDEN_OPTIONS).hash).toBe(before.hash);
  });

  it('matches the golden sheet committed beside it', () => {
    const { png } = compileProject(knightProject(), GOLDEN_OPTIONS);
    // A change to the renderer must change this file deliberately. Regenerate it
    // with `UPDATE_GOLDEN=1 pnpm test`, then open the PNG and look at it before
    // committing: the point of a golden image is that a person saw it.
    if (process.env.UPDATE_GOLDEN === '1') {
      mkdirSync(path.dirname(GOLDEN_SHEET), { recursive: true });
      writeFileSync(GOLDEN_SHEET, png);
    }
    expect(sha256Hex(png)).toBe(sha256Hex(new Uint8Array(readFileSync(GOLDEN_SHEET))));
  });
});

describe('compiling in a second process', () => {
  it('gives the same bytes as this one', () => {
    const here = compileProject(knightProject(), GOLDEN_OPTIONS);
    const there = compileInAnotherProcess();
    expect(there.hash).toBe(here.hash);
    expect(there.png).toBe(sha256Hex(here.png));
    expect(there.bytes).toBe(here.png.length);
  }, 60_000);
});

/**
 * Bundle the engine on its own and run it under a bare Node process.
 *
 * `platform: 'neutral'` is the point of the exercise: esbuild will not fill in a
 * Node builtin or a browser global, so a bundle that builds at all is a bundle
 * that needed nothing but itself.
 */
function compileInAnotherProcess(): { hash: string; png: string; bytes: number } {
  const directory = mkdtempSync(path.join(tmpdir(), 'pixel-engine-'));
  const entry = path.join(directory, 'compile-elsewhere.ts');
  writeFileSync(
    entry,
    [
      `import { compileProject } from ${JSON.stringify(path.join(__dirname, 'compile'))};`,
      `import { sha256Hex } from ${JSON.stringify(path.join(__dirname, 'hash'))};`,
      `import { knightProject } from ${JSON.stringify(path.join(__dirname, 'testing', 'fixtures'))};`,
      `const result = compileProject(knightProject(), ${JSON.stringify(GOLDEN_OPTIONS)});`,
      'console.log(JSON.stringify({ hash: result.hash, png: sha256Hex(result.png), bytes: result.png.length }));',
    ].join('\n'),
  );

  const bundle = path.join(directory, 'bundle.mjs');
  buildSync({ entryPoints: [entry], bundle: true, outfile: bundle, format: 'esm', platform: 'neutral', target: 'node22' });
  return JSON.parse(execFileSync(process.execPath, [bundle], { encoding: 'utf8' }));
}
