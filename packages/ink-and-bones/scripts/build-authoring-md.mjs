/**
 * Generate `AUTHORING.md` from `AUTHORING_GUIDE`.
 *
 * The guide is a string because it is also the system material handed to an
 * authoring model, and it has to version in lockstep with the API it teaches.
 * A human reading the repo should not have to open a TypeScript file to find
 * it, and a second hand-written copy would drift — so the markdown is
 * generated from the one source. Run `pnpm build:docs`; `docs.test.ts` fails
 * if the committed file has gone stale.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTHORING_GUIDE } from '../src/authoring-guide.ts';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const header = [
  '<!-- GENERATED from src/authoring-guide.ts by scripts/build-authoring-md.mjs.',
  '     Edit the guide, then run `pnpm build:docs`. -->',
  '',
].join('\n');
writeFileSync(path.join(pkg, 'AUTHORING.md'), header + AUTHORING_GUIDE + '\n');
console.log('wrote AUTHORING.md');
