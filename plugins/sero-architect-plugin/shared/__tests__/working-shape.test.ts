/**
 * An assumption may carry the reason it was made. A record saved before
 * reasons existed still holds plain strings and must still read.
 */

import { describe, expect, it } from 'vitest';

import { assumptionOf } from '../agreement';
import { parseWorking } from '../working-shape';

const T0 = '2026-01-01T00:00:00.000Z';
const parse = (assumptionsJson: string) => parseWorking({ objective: 'Ship it', assumptionsJson }, undefined, T0);

describe('assumptions on the working interpretation', () => {
  it('saves an object item with its reason', () => {
    const result = parse('[{"text":" Use SQLite ","why":" No server needed "},{"text":"Plain"}]');
    expect(result.ok && result.working.assumptions).toEqual([{ text: 'Use SQLite', why: 'No server needed' }, { text: 'Plain' }]);
  });

  it('still takes a plain string, stored as an assumption with no reason', () => {
    const result = parse('["Use SQLite"]');
    expect(result.ok && result.working.assumptions).toEqual([{ text: 'Use SQLite' }]);
    expect(assumptionOf('old record')).toEqual({ text: 'old record' });
  });

  it('refuses a malformed item and names the shape', () => {
    for (const raw of ['[42]', '[{"why":"no text"}]', '[{"text":"x","why":7}]', '[""]']) {
      const result = parse(raw);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toContain('"text"');
    }
  });
});
