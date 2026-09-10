import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queueModelAvailabilityRefresh: vi.fn(),
}));

vi.mock('@electron/ipc/agent/core/model-availability-refresh', () => ({
  queueModelAvailabilityRefresh: mocks.queueModelAvailabilityRefresh,
}));

import { refreshModelAvailabilityAfterCredentialChange } from '@electron/ipc/platform/auth/auth-model-refresh';

describe('refreshModelAvailabilityAfterCredentialChange', () => {
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarn.mockClear();
    mocks.queueModelAvailabilityRefresh.mockReset();
  });

  it('does not fail the credential flow when model reconciliation hits an unrelated refresh error', async () => {
    mocks.queueModelAvailabilityRefresh.mockRejectedValue(new Error('models.json is invalid'));

    await expect(refreshModelAvailabilityAfterCredentialChange('anthropic')).resolves.toBeUndefined();

    expect(consoleWarn).toHaveBeenCalledWith(
      '[auth] Credentials changed for anthropic but model refresh failed:',
      expect.any(Error),
    );
  });

  it('awaits the shared queue so the offline guard and timeout apply', async () => {
    mocks.queueModelAvailabilityRefresh.mockResolvedValue({
      sharedModel: null,
      updatedChatSessions: 0,
      updatedAppSessions: 0,
      refreshWarnings: [],
    });

    await expect(refreshModelAvailabilityAfterCredentialChange('anthropic')).resolves.toBeUndefined();

    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('hands every concurrent credential change to the shared queue', async () => {
    mocks.queueModelAvailabilityRefresh.mockResolvedValue({
      sharedModel: null,
      updatedChatSessions: 0,
      updatedAppSessions: 0,
      refreshWarnings: [],
    });

    await Promise.all([
      refreshModelAvailabilityAfterCredentialChange('first'),
      refreshModelAvailabilityAfterCredentialChange('second'),
    ]);

    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenNthCalledWith(1, { force: true });
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenNthCalledWith(2, { force: true });
  });
});
