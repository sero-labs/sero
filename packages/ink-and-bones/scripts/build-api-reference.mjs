/**
 * Generate `src/api-reference.ts` — the engine's authoring surface as
 * TypeScript declarations, handed to an authoring model beside the prose
 * guide.
 *
 * Prose examples must be generalised from; a signature cannot be misread. The
 * knight that lost its visor, shield emblem and crossguard wrote
 * `stroke(points, 3, colour)` while the guide's example showed an array — the
 * declaration says `widths: readonly number[]` and ends the argument.
 *
 * Generated, never hand-written: a hand-copied API is a second source of truth
 * that drifts silently, which is the class of fault this whole exercise is
 * about. Run `pnpm build:api` after changing the authoring surface;
 * api-reference.test.ts fails if the committed file has gone stale.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');

/** The author's world, in reading order. Deliberately NOT the whole package:
 * the bake, audit, review and metrics modules are the runtime's business, and
 * naming them invites an author to call them. */
export const SURFACE = ['vec', 'img', 'paint', 'skeleton', 'motion', 'compositor', 'spec'];

/** Drop the module's own imports (the reference is read as one document) and
 * any private class member, which is not part of the surface. */
function clean(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line) && !/^\s*private\s/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderApiReference(read) {
  const parts = SURFACE.map((module) => `// ---- ${module} ${'-'.repeat(66 - module.length)}\n\n${clean(read(module))}`);
  return parts.join('\n\n');
}

function main() {
  const out = mkdtempSync(path.join(tmpdir(), 'ink-dts-'));
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
      { cwd: pkg, stdio: 'inherit' },
    );
    const body = renderApiReference((module) => readFileSync(path.join(out, `${module}.d.ts`), 'utf8'));
    const file = `/**
 * The engine's authoring surface as TypeScript declarations — GENERATED.
 *
 * Do not edit: run \`pnpm build:api\` in this package. See
 * scripts/build-api-reference.mjs for why this exists and what it omits.
 */

export const API_REFERENCE = \`${body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}
\`;
`;
    writeFileSync(path.join(pkg, 'src/api-reference.ts'), file, 'utf8');
    console.log(`api-reference.ts written (${body.split('\n').length} lines of declarations)`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
