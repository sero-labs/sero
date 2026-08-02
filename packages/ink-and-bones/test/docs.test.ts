/**
 * AUTHORING.md is generated from AUTHORING_GUIDE, and this is what stops the
 * two drifting. A hand-maintained second copy of the authoring rules is the
 * exact class of fault the guide itself is about.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUTHORING_GUIDE } from '../src/index';

describe('AUTHORING.md', () => {
  it('matches the guide — run `pnpm build:docs` if this fails', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'AUTHORING.md');
    const committed = readFileSync(file, 'utf8');
    expect(committed).toContain(AUTHORING_GUIDE);
  });

  it('says it is generated, so nobody edits it by hand', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'AUTHORING.md');
    expect(readFileSync(file, 'utf8')).toMatch(/^<!-- GENERATED/);
  });
});
