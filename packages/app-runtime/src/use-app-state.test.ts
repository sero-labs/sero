import { describe, expect, it } from 'vitest';

import { applyDefaultState } from './use-app-state';

interface DemoState {
  name: string;
  count: number;
  tags: string[];
  nested: { open: boolean };
  optional?: { from: string };
}

const DEFAULT_STATE: DemoState = {
  name: '',
  count: 0,
  tags: [],
  nested: { open: false },
};

describe('applyDefaultState', () => {
  it('takes the file’s values over the defaults', () => {
    expect(applyDefaultState(DEFAULT_STATE, {
      name: 'repo',
      count: 3,
      tags: ['a'],
      nested: { open: true },
    })).toEqual({ name: 'repo', count: 3, tags: ['a'], nested: { open: true } });
  });

  it('keeps the default where the file disagrees about the type', () => {
    const merged = applyDefaultState(DEFAULT_STATE, { name: 42, tags: 'nope' });
    expect(merged.name).toBe('');
    expect(merged.tags).toEqual([]);
  });

  it('fills in what the file leaves out', () => {
    expect(applyDefaultState(DEFAULT_STATE, { name: 'repo' }).count).toBe(0);
  });

  // An `undefined` default says the field is optional, not that it must be
  // absent. Enforcing it dropped the file's value on every read, which is how
  // a whole feature's state could be written correctly and never arrive.
  it('passes optional fields through when the default is undefined', () => {
    const withOptional: DemoState = { ...DEFAULT_STATE, optional: undefined };

    expect(applyDefaultState(withOptional, {
      name: 'repo',
      optional: { from: 'the file' },
    }).optional).toEqual({ from: 'the file' });
  });

  it('leaves an absent optional field absent', () => {
    const withOptional: DemoState = { ...DEFAULT_STATE, optional: undefined };
    expect(applyDefaultState(withOptional, { name: 'repo' }).optional).toBeUndefined();
  });
});
