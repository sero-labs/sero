import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredGrant } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

import { proposal } from './grant-store.fixtures';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: {
    read: mocks.read,
    update: mocks.update,
  },
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  SERO_SESSION_DIR: '/sessions',
}));

vi.mock('@electron/shared/infra/ai-infra', () => ({
  ensureAiInfra: vi.fn(),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_HOME: '/sero',
}));

describe('persistent session grant store singleton', () => {
  let persisted: Record<string, StoredGrant> | null;

  beforeEach(async () => {
    persisted = null;
    mocks.read.mockReset();
    mocks.update.mockReset();
    mocks.update.mockImplementation(async (
      _file: string,
      updater: (current: Record<string, StoredGrant> | null) => Record<string, StoredGrant>,
    ) => {
      persisted = structuredClone(updater(persisted));
    });

    const { resetGrantStoreForTests } = await import(
      '@electron/features/apps/runtime/capabilities/persistent-sessions'
    );
    resetGrantStoreForTests();
  });

  afterEach(async () => {
    const { resetGrantStoreForTests } = await import(
      '@electron/features/apps/runtime/capabilities/persistent-sessions'
    );
    resetGrantStoreForTests();
  });

  it('shares initialization so concurrent callers cannot overwrite grants', async () => {
    let finishRead: ((value: null) => void) | undefined;
    mocks.read.mockImplementationOnce(() => new Promise<null>((resolve) => {
      finishRead = resolve;
    }));
    const { getGrantStore } = await import(
      '@electron/features/apps/runtime/capabilities/persistent-sessions'
    );

    const firstStore = getGrantStore();
    const secondStore = getGrantStore();

    expect(mocks.read).toHaveBeenCalledOnce();
    finishRead?.(null);
    const [first, second] = await Promise.all([firstStore, secondStore]);
    expect(first).toBe(second);

    await Promise.all([
      first.issue('orchestrator', (grantId) => `/sessions/${grantId}`, 'approval-1', proposal()),
      second.issue('orchestrator', (grantId) => `/sessions/${grantId}`, 'approval-2', proposal()),
    ]);

    expect(Object.keys(persisted ?? {})).toHaveLength(2);
  });

  it('retries initialization after a shared attempt fails', async () => {
    mocks.read
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce(null);
    const { getGrantStore } = await import(
      '@electron/features/apps/runtime/capabilities/persistent-sessions'
    );

    const failedAttempts = await Promise.allSettled([getGrantStore(), getGrantStore()]);
    expect(failedAttempts).toEqual([
      expect.objectContaining({ status: 'rejected', reason: new Error('read failed') }),
      expect.objectContaining({ status: 'rejected', reason: new Error('read failed') }),
    ]);
    expect(mocks.read).toHaveBeenCalledOnce();

    const recovered = await getGrantStore();
    expect(await getGrantStore()).toBe(recovered);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});
