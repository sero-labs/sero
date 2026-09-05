import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { VALID_REQUEST_TYPES } from '@electron/features/gateway/server/request-validation';

/**
 * The type literal of every request interface in `protocol.ts`.
 *
 * Read from the source, because a request type absent from the
 * allowlist is rejected before routing. That failure is silent in a
 * unit test and only shows up against the real host, so it is worth
 * catching here.
 */
function declaredRequestTypes(): string[] {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../features/gateway/server/protocol.ts'),
    'utf8',
  );

  const types: string[] = [];
  const blocks = source.split('export interface ');
  for (const block of blocks.slice(1)) {
    const name = block.slice(0, block.indexOf(' '));
    if (!name.endsWith('Request')) continue;
    const match = /\n\s*type:\s*'([a-z_]+)'/.exec(block);
    if (match) types.push(match[1]);
  }
  return types;
}

describe('the request allowlist', () => {
  it('covers every request type the protocol declares', () => {
    const declared = declaredRequestTypes();

    expect(declared.length).toBeGreaterThan(20);
    expect(declared.filter((type) => !VALID_REQUEST_TYPES.has(type as never))).toEqual([]);
  });

  it('names nothing the protocol does not declare', () => {
    const declared = new Set(declaredRequestTypes());

    expect([...VALID_REQUEST_TYPES].filter((type) => !declared.has(type))).toEqual([]);
  });
});
