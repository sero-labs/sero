import { describe, expect, it } from 'vitest';
import { mergeVariables } from '../outcomes';

describe('mergeVariables', () => {
  it('shallow-merges distinct keys so later steps see earlier facts', () => {
    expect(mergeVariables({ targetFile: 'a.ts' }, { symbol: 'App' })).toEqual({ targetFile: 'a.ts', symbol: 'App' });
  });

  it('overwrites a non-notes key with the newer value', () => {
    expect(mergeVariables({ count: 1 }, { count: 2 })).toEqual({ count: 2 });
  });

  it('accumulates the notes scratchpad across steps', () => {
    const after1 = mergeVariables({}, { notes: 'found text in main.tsx' });
    const after2 = mergeVariables(after1, { notes: 'styling uses Tailwind' });
    expect(after2.notes).toBe('found text in main.tsx\nstyling uses Tailwind');
  });

  it('keeps existing notes when a step adds none', () => {
    expect(mergeVariables({ notes: 'kept' }, { other: 1 }).notes).toBe('kept');
    expect(mergeVariables({ notes: 'kept' }, { notes: '   ' }).notes).toBe('kept');
  });

  it('returns existing unchanged when nothing is emitted', () => {
    const existing = { notes: 'x' };
    expect(mergeVariables(existing, undefined)).toBe(existing);
  });
});
