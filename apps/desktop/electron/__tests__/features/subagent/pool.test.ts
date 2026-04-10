import { describe, it, expect } from 'vitest';
import { ConcurrencyPool } from '@electron/features/subagent/core/pool';

function makeController() {
  return new AbortController();
}

describe('ConcurrencyPool', () => {
  it('acquires up to maxTotal slots', async () => {
    const pool = new ConcurrencyPool(2, 4);
    const c1 = makeController();
    const c2 = makeController();

    await pool.acquireSlot('a', 'session1', c1);
    await pool.acquireSlot('b', 'session1', c2);

    expect(pool.getActiveCount()).toBe(2);
  });

  it('blocks when maxTotal reached, resolves when slot freed', async () => {
    const pool = new ConcurrencyPool(1, 4);
    const c1 = makeController();
    const c2 = makeController();

    await pool.acquireSlot('a', 'session1', c1);

    let resolved = false;
    const p = pool.acquireSlot('b', 'session1', c2).then(() => { resolved = true; });

    // Give microtasks a chance to run
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    pool.releaseSlot('a', 'session1');
    await p;
    expect(resolved).toBe(true);
    expect(pool.getActiveCount()).toBe(1);
  });

  it('respects per-call maxConcurrent independently of maxTotal', async () => {
    const pool = new ConcurrencyPool(10, 1); // high global, low per-call
    const c1 = makeController();
    const c2 = makeController();
    const callGroup = 'call-1';

    await pool.acquireSlot('a', 'session1', c1, callGroup);

    let resolved = false;
    const p = pool.acquireSlot('b', 'session1', c2, callGroup).then(() => { resolved = true; });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false); // blocked by per-call limit

    pool.releaseSlot('a', 'session1', callGroup);
    await p;
    expect(resolved).toBe(true);
  });

  it('abortAll aborts all controllers for a parent session', async () => {
    const pool = new ConcurrencyPool(10, 10);
    const c1 = makeController();
    const c2 = makeController();

    await pool.acquireSlot('a', 'session1', c1);
    await pool.acquireSlot('b', 'session1', c2);

    pool.abortAll('session1');

    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(pool.getActiveCount()).toBe(0);
  });

  it('abortAll does not affect other parent sessions', async () => {
    const pool = new ConcurrencyPool(10, 10);
    const c1 = makeController();
    const c2 = makeController();

    await pool.acquireSlot('a', 'session1', c1);
    await pool.acquireSlot('b', 'session2', c2);

    pool.abortAll('session1');

    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(false);
    expect(pool.getActiveCount()).toBe(1);
  });

  it('releaseSlot makes slot available for next waiter', async () => {
    const pool = new ConcurrencyPool(1, 4);
    const c1 = makeController();
    const c2 = makeController();
    const c3 = makeController();

    await pool.acquireSlot('a', 's1', c1);

    const order: string[] = [];
    const p1 = pool.acquireSlot('b', 's1', c2).then(() => order.push('b'));
    const p2 = pool.acquireSlot('c', 's1', c3).then(() => order.push('c'));

    pool.releaseSlot('a', 's1');
    await p1;
    pool.releaseSlot('b', 's1');
    await p2;

    // FIFO order
    expect(order).toEqual(['b', 'c']);
  });

  it('double-release is a no-op (no underflow)', async () => {
    const pool = new ConcurrencyPool(2, 4);
    const c1 = makeController();

    await pool.acquireSlot('a', 'session1', c1);
    expect(pool.getActiveCount()).toBe(1);

    pool.releaseSlot('a', 'session1');
    expect(pool.getActiveCount()).toBe(0);

    // Double release should not go negative or throw
    pool.releaseSlot('a', 'session1');
    expect(pool.getActiveCount()).toBe(0);
  });
});
