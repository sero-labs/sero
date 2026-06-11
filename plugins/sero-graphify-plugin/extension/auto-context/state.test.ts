import { describe, expect, it } from 'vitest';
import { addBoundedSet, createGraphContextState, MAX_AUGMENT_CACHE_KEYS } from './state';

describe('addBoundedSet', () => {
  it('adds keys up to the bound', () => {
    const set = new Set<string>();
    addBoundedSet(set, 'a', 3);
    addBoundedSet(set, 'b', 3);
    addBoundedSet(set, 'c', 3);
    expect(set.size).toBe(3);
  });

  it('evicts the oldest key when full', () => {
    const set = new Set<string>();
    addBoundedSet(set, 'a', 2);
    addBoundedSet(set, 'b', 2);
    addBoundedSet(set, 'c', 2);
    expect(set.size).toBe(2);
    expect(set.has('a')).toBe(false);
    expect(set.has('c')).toBe(true);
  });

  it('exports a sane cache bound', () => {
    expect(MAX_AUGMENT_CACHE_KEYS).toBeGreaterThan(0);
  });
});

describe('createGraphContextState', () => {
  it('starts idle with empty caches', () => {
    const state = createGraphContextState();
    expect(state.graphExists).toBe(false);
    expect(state.augmentHits).toBe(0);
    expect(state.augmentedCache.size).toBe(0);
    expect(state.reportContextInjected).toBe(false);
  });
});
