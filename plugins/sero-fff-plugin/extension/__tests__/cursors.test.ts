import { describe, expect, it } from 'vitest';

import { BoundedCursorStore, CursorExpiredError } from '../cursors';

describe('BoundedCursorStore', () => {
  it('expires the oldest cursor when the store reaches its bound', () => {
    const cursors = new BoundedCursorStore<number>('c', 2);
    const expired = cursors.put(1);
    cursors.put(2);
    cursors.put(3);

    expect(() => cursors.take(expired)).toThrow(CursorExpiredError);
  });

  it('makes cursor tokens single-use', () => {
    const cursors = new BoundedCursorStore<number>('c');
    const cursor = cursors.put(42);

    expect(cursors.take(cursor)).toBe(42);
    expect(() => cursors.take(cursor)).toThrow(/expired or does not belong/);
  });
});
