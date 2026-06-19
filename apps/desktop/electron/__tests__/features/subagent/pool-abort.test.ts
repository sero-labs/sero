import { describe, expect, it } from 'vitest';

import { ConcurrencyPool } from '@electron/features/subagent/core/pool';

describe('ConcurrencyPool abort while queued', () => {
  it('resolves a queued acquire promptly on abort, without taking a slot', async () => {
    const pool = new ConcurrencyPool(1, 1);
    const a = new AbortController();
    const b = new AbortController();

    await pool.acquireSlot('a', 'parent', a);

    const queued = pool.acquireSlot('b', 'parent', b);
    b.abort();
    await queued; // must resolve without waiting for slot 'a' to free

    expect(pool.getActiveCount()).toBe(1); // only 'a' holds a slot
    pool.releaseSlot('b', 'parent'); // no-op — 'b' never registered
    expect(pool.getActiveCount()).toBe(1);
  });

  it('returns immediately when acquiring with an already-aborted controller', async () => {
    const pool = new ConcurrencyPool(1, 1);
    const a = new AbortController();
    await pool.acquireSlot('a', 'parent', a);

    const b = new AbortController();
    b.abort();
    await pool.acquireSlot('b', 'parent', b); // resolves despite zero capacity
    expect(pool.getActiveCount()).toBe(1);
  });
});
