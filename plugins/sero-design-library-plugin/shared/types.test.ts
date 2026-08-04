import { describe, expect, it } from 'vitest';

import { DEFAULT_STATE, normalizeState } from './types';

describe('colour filter normalization', () => {
  it('drops the obsolete exact-colour filter values', () => {
    const normalized = normalizeState({
      ...DEFAULT_STATE,
      view: {
        ...DEFAULT_STATE.view,
        filters: { ...DEFAULT_STATE.view.filters, colours: ['#e53935'] },
      },
    });

    expect(normalized.view.filters.colourFamilies).toEqual([]);
  });

  it('keeps valid colour families', () => {
    const normalized = normalizeState({
      ...DEFAULT_STATE,
      view: {
        ...DEFAULT_STATE.view,
        filters: { ...DEFAULT_STATE.view.filters, colourFamilies: ['Reds', 'invalid'] },
      },
    });

    expect(normalized.view.filters.colourFamilies).toEqual(['Reds']);
  });
});

describe('view normalization', () => {
  it('keeps the saved Library query', () => {
    const normalized = normalizeState({
      ...DEFAULT_STATE,
      view: { ...DEFAULT_STATE.view, query: 'editorial grid' },
    });

    expect(normalized.view.query).toBe('editorial grid');
  });
});
