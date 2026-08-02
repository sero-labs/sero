/**
 * The generated API reference is system material for a model that cannot read
 * the engine source, and it is committed rather than built at runtime — so the
 * only thing standing between it and silent drift is this file. It regenerates
 * from the same declarations the build script uses and demands a byte match.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API_REFERENCE } from '../src/index';
// @ts-expect-error — the generator is plain JS on purpose: it runs with bare
// node, so the package needs no TypeScript runner as a dependency.
import { SURFACE, renderApiReference } from '../scripts/build-api-reference.mjs';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the generated API reference', () => {
  it('matches the current declarations — run `pnpm build:api` if this fails', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'ink-dts-test-'));
    try {
      execFileSync(
        'node',
        [
          path.join(pkg, 'node_modules/typescript/bin/tsc'),
          '--declaration',
          '--emitDeclarationOnly',
          '--noEmit',
          'false',
          '--outDir',
          out,
        ],
        { cwd: pkg, stdio: 'pipe' },
      );
      const fresh = renderApiReference((module: string) =>
        readFileSync(path.join(out, `${module}.d.ts`), 'utf8'),
      );
      expect(API_REFERENCE.trim()).toBe(fresh.trim());
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);

  it('states the signatures that used to be guessed wrong', () => {
    // Each of these was written with the wrong argument shape by a model that
    // had only the prose guide, and each drew nothing in silence.
    for (const signature of [
      'stroke(points: readonly Vec[], widths: readonly number[], c: Color): void;',
      'occludeAbove(atY: number, depth: number, amount: number): void;',
      'polygon(points: readonly Vec[], c: Color): void;',
      'export interface Shadow {',
    ]) {
      expect(API_REFERENCE).toContain(signature);
    }
  });

  it('carries the authoring surface and withholds the runtime internals', () => {
    for (const name of ['class Paint', 'class Skeleton', 'class Motion', 'interface CharacterSpec']) {
      expect(API_REFERENCE).toContain(name);
    }
    // The audit, review and metrics modules belong to the runtime; naming them
    // invites an author to call them instead of reading its report.
    expect(SURFACE).not.toContain('audit');
    expect(API_REFERENCE).not.toContain('auditClip');
    expect(API_REFERENCE).not.toContain('frameStrip');
    // Guards are enforcement, not authoring surface.
    expect(API_REFERENCE).not.toContain('assertWidths');
  });
});
