import { describe, expect, it } from 'vitest';

import { CleanupPlanStore } from '@electron/features/git/worktree/pool/cleanup-plans';
import { executeWorktreeCleanupPlan } from '@electron/features/git/worktree/pool/cleanup-execute';
import type { AppRuntimeWorktreePoolStatus } from '@sero-ai/common';

const emptyPool: AppRuntimeWorktreePoolStatus = {
  repositoryId: 'repo-1',
  revision: 4,
  observedAt: '2026-09-01T12:00:00.000Z',
  slots: [],
};

describe('cleanup confirmation plan storage', () => {
  it('is one-shot and rejects fabricated identifiers', () => {
    const store = new CleanupPlanStore(1_000, () => 'plan-1');
    const now = new Date('2026-09-01T12:00:00.000Z');
    store.issue(emptyPool, '/repo', now);

    expect(store.consume('fabricated', now).status).toBe('unknown');
    expect(store.consume('plan-1', now).status).toBe('ok');
    expect(store.consume('plan-1', now).status).toBe('unknown');
  });

  it('expires without waiting and invalidates an older plan for the repository', () => {
    let id = 0;
    const store = new CleanupPlanStore(10, () => `plan-${++id}`);
    const now = new Date('2026-09-01T12:00:00.000Z');
    const first = store.issue(emptyPool, '/repo', now);
    const second = store.issue(emptyPool, '/repo', new Date(now.getTime() + 1));

    expect(store.consume(first.planId, now).status).toBe('unknown');
    expect(store.consume(second.planId, new Date(now.getTime() + 20)).status).toBe('expired');
  });

  it('rejects a fabricated plan before resolving a path or running cleanup', async () => {
    const removeWorktree = async () => {
      throw new Error('must not run');
    };
    await expect(executeWorktreeCleanupPlan('/renderer/path', 'fabricated', {
      plans: new CleanupPlanStore(),
      removeWorktree,
    })).resolves.toMatchObject({ status: 'rejected', planId: 'fabricated' });
  });
});
