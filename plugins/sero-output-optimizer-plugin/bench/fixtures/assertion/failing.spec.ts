import { describe, expect, it } from 'vitest';

/**
 * Produces a real Vitest assertion failure, including `AssertionError`, the
 * expected/received diff and a source excerpt. The bench compacts this output
 * through the production stream path.
 */
describe('bench assertion fixture', () => {
  it('fails an object equality assertion', () => {
    expect({ id: 1, name: 'alpha' }).toEqual({ id: 1, name: 'beta' });
  });
});
