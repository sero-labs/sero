import { describe, expect, it, vi } from 'vitest';
import type { GoalIndex } from '../../shared/goal-types';
import { createGoalStore, type GoalStoreIo } from '../goals/goal-store';

describe('Goal store loading', () => {
  it('retries after a transient initial read failure', async () => {
    let readCount = 0;
    const index = { schemaVersion: 1, goals: [] } satisfies GoalIndex;
    const read: GoalStoreIo['read'] = async <T,>() => {
      readCount += 1;
      if (readCount === 1) throw new Error('temporary read failure');
      return index as T;
    };
    const store = createGoalStore({
      read,
      write: vi.fn(),
      remove: vi.fn(),
    }, '/state');

    await expect(store.list()).rejects.toThrow('temporary read failure');
    await expect(store.list()).resolves.toEqual([]);
    expect(readCount).toBe(2);
  });
});
