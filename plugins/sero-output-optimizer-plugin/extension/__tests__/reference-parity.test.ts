import { describe, expect, it } from 'vitest';

import { REFERENCE_ATTRIBUTION, referenceLosses } from '../../bench/reference-losses';
import { compactCapture } from '../compaction';
import { preservesProtectedContent } from '../compaction/preservation';

/**
 * The reference implementation's losses must not recur.
 *
 * Each fixture proves the reference lost content; Sero's rule must keep it.
 */
describe('reference parity', () => {
  it('keeps the MIT attribution for the vendored fixtures', () => {
    expect(REFERENCE_ATTRIBUTION).toContain('pi-rtk-optimizer');
    expect(REFERENCE_ATTRIBUTION).toContain('MasuRii');
  });

  for (const fixture of referenceLosses) {
    it(`keeps content the reference lost: ${fixture.name}`, () => {
      for (const lost of fixture.referenceLoses) {
        expect(fixture.referenceOutput).not.toContain(lost);
      }

      const outcome = compactCapture(fixture.input, fixture.category);
      for (const lost of fixture.referenceLoses) {
        expect(outcome.candidate).toContain(lost);
      }
      expect(preservesProtectedContent(fixture.input, outcome.candidate, fixture.category)).toBe(true);
    });
  }
});
