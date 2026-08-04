import { describe, expect, it } from 'vitest';

import type { EditableLibrarianProfile, LibrarianAnalysis, LibrarianField } from './librarian';
import {
  clearOverride,
  effectiveAnalysis,
  effectiveField,
  emptyAnalysis,
  isOverridden,
  normalizeOverrides,
  replaceGenerated,
  setOverride,
  validateFieldValue,
} from './librarian';

function generated(overrides: Partial<LibrarianAnalysis> = {}): LibrarianAnalysis {
  return { ...emptyAnalysis('Generated title'), primaryStyle: 'Dark luxury', tags: ['a', 'b'], ...overrides };
}

function profile(): EditableLibrarianProfile {
  return { generated: generated(), overrides: {} };
}

describe('the override contract', () => {
  it('shows the generated value until a field is overridden', () => {
    const base = profile();
    expect(effectiveField(base, 'title')).toBe('Generated title');
    expect(isOverridden(base, 'title')).toBe(false);

    const edited = setOverride(base, 'title', 'My title', 1);
    expect(effectiveField(edited, 'title')).toBe('My title');
    expect(isOverridden(edited, 'title')).toBe(true);
  });

  it('marks a field manual by the presence of an override, not its value', () => {
    // Deliberately blanking a field must survive reanalysis, which only works
    // if presence rather than truthiness decides.
    const blanked = setOverride(profile(), 'primaryStyle', '', 1);
    expect(isOverridden(blanked, 'primaryStyle')).toBe(true);
    expect(effectiveField(blanked, 'primaryStyle')).toBe('');

    const reanalysed = replaceGenerated(blanked, generated({ primaryStyle: 'Editorial' }));
    expect(effectiveField(reanalysed, 'primaryStyle')).toBe('');
  });

  it('resets one field without touching the others', () => {
    const edited = setOverride(
      setOverride(profile(), 'title', 'Mine', 1),
      'primaryStyle',
      'Mine too',
      1,
    );
    const reset = clearOverride(edited, 'title');

    expect(isOverridden(reset, 'title')).toBe(false);
    expect(effectiveField(reset, 'title')).toBe('Generated title');
    expect(effectiveField(reset, 'primaryStyle')).toBe('Mine too');
  });

  it('keeps manual fields and refreshes untouched ones on reanalysis', () => {
    const edited = setOverride(profile(), 'title', 'Kept by hand', 1);
    const reanalysed = replaceGenerated(
      edited,
      generated({ title: 'New generated title', primaryStyle: 'High density' }),
    );

    expect(effectiveField(reanalysed, 'title')).toBe('Kept by hand');
    expect(effectiveField(reanalysed, 'primaryStyle')).toBe('High density');
  });

  it('applies every override in the whole analysis', () => {
    const edited = setOverride(setOverride(profile(), 'tags', ['x'], 1), 'summary', 'A summary.', 1);
    const analysis = effectiveAnalysis(edited);

    expect(analysis.tags).toEqual(['x']);
    expect(analysis.summary).toBe('A summary.');
    expect(analysis.primaryStyle).toBe('Dark luxury');
    // Generation-only metadata must not leak into the user-facing shape.
    expect('provenance' in analysis).toBe(false);
    expect('confidence' in analysis).toBe(false);
  });

  it('gives generated notes an empty baseline so reset never restores text the user did not write', () => {
    expect(emptyAnalysis('t').notes).toBe('');
  });
});

describe('validateFieldValue', () => {
  it('accepts a correctly shaped value for every field', () => {
    const good: Array<[LibrarianField, unknown]> = [
      ['title', 'Northstar'],
      ['notes', ''],
      ['primaryStyle', 'Editorial'],
      ['summary', 'One sentence.'],
      ['designIntent', 'An intent.'],
      ['generationPrompt', 'words'],
      ['designTypes', ['dashboard']],
      ['tags', ['a', 'b']],
      ['always', []],
      ['never', ['no gradients']],
      ['aestheticVocabulary', [{ term: 'terse' }, { term: 'exact', meaning: 'precise' }]],
      ['palette', [{ hex: '#0b0b0d', role: 'background' }]],
      ['visualProfile', { colour: ['near-black'] }],
    ];
    for (const [field, value] of good) {
      expect(validateFieldValue(field, value).ok, `${field} should accept`).toBe(true);
    }
  });

  it('rejects a value of the wrong shape rather than coercing it', () => {
    // Coercing would tell the caller it worked while discarding their data,
    // and a number reaching `tags` crashes the projection.
    const bad: Array<[LibrarianField, unknown]> = [
      ['title', 42],
      ['title', null],
      ['tags', 'not-an-array'],
      ['tags', [1, 2]],
      ['designTypes', {}],
      ['aestheticVocabulary', ['plain string']],
      ['aestheticVocabulary', [{ meaning: 'no term' }]],
      ['palette', [{ hex: 'not-a-colour' }]],
      ['palette', ['#fff']],
      ['visualProfile', 'nope'],
      ['visualProfile', { colour: [1] }],
    ];
    for (const [field, value] of bad) {
      const result = validateFieldValue(field, value);
      expect(result.ok, `${field} = ${JSON.stringify(value)} should be rejected`).toBe(false);
      if (!result.ok) expect(result.reason).toContain(field);
    }
  });

  it('fills the missing groups when a partial visual profile is accepted', () => {
    const result = validateFieldValue('visualProfile', { colour: ['a'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ colour: ['a'], typography: [], motion: [] });
  });
});

describe('normalizeOverrides', () => {
  it('keeps valid overrides and drops poisoned ones', () => {
    const overrides = normalizeOverrides({
      title: { field: 'title', value: 'Kept', updatedAt: 5 },
      tags: { field: 'tags', value: 99 },
      notAField: { field: 'notAField', value: 'x' },
      palette: 'not even an object',
    });

    expect(Object.keys(overrides)).toEqual(['title']);
    expect(overrides.title).toEqual({ field: 'title', value: 'Kept', updatedAt: 5 });
  });

  it('survives a completely malformed overrides blob', () => {
    expect(normalizeOverrides(null)).toEqual({});
    expect(normalizeOverrides('nope')).toEqual({});
    expect(normalizeOverrides([1, 2, 3])).toEqual({});
  });
});
