import { describe, expect, it } from 'vitest';
import { LoopLocks } from '../locks';

describe('LoopLocks', () => {
  it('grants the lock once and rejects a second acquire', () => {
    const locks = new LoopLocks();
    expect(locks.tryAcquire('l1')).toBe(true);
    expect(locks.tryAcquire('l1')).toBe(false);
    expect(locks.isHeld('l1')).toBe(true);
  });

  it('allows re-acquire after release', () => {
    const locks = new LoopLocks();
    locks.tryAcquire('l1');
    locks.release('l1');
    expect(locks.tryAcquire('l1')).toBe(true);
  });

  it('locks are independent per loop', () => {
    const locks = new LoopLocks();
    expect(locks.tryAcquire('a')).toBe(true);
    expect(locks.tryAcquire('b')).toBe(true);
  });
});
