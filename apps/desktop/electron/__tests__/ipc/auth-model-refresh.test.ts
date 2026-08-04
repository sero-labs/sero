import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshModelAvailability: vi.fn(),
}));

vi.mock('@electron/ipc/agent/core/model-availability-refresh', () => ({
  refreshModelAvailability: mocks.refreshModelAvailability,
}));

import { refreshModelAvailabilityAfterCredentialChange } from '@electron/ipc/platform/auth/auth-model-refresh';

describe('refreshModelAvailabilityAfterCredentialChange', () => {
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarn.mockClear();
    mocks.refreshModelAvailability.mockReset();
  });

  it('does not fail the credential flow when model reconciliation hits an unrelated refresh error', async () => {
    mocks.refreshModelAvailability.mockRejectedValue(new Error('models.json is invalid'));

    await expect(refreshModelAvailabilityAfterCredentialChange('anthropic')).resolves.toBeUndefined();

    expect(consoleWarn).toHaveBeenCalledWith(
      '[auth] Credentials changed for anthropic but model refresh failed:',
      expect.any(Error),
    );
  });

  it('still awaits a successful refresh when reconciliation succeeds', async () => {
    mocks.refreshModelAvailability.mockResolvedValue({
      sharedModel: null,
      updatedChatSessions: 0,
      updatedAppSessions: 0,
    });

    await expect(refreshModelAvailabilityAfterCredentialChange('anthropic')).resolves.toBeUndefined();

    expect(mocks.refreshModelAvailability).toHaveBeenCalledOnce();
    expect(mocks.refreshModelAvailability).toHaveBeenCalledWith({
      allowNetwork: true,
      force: true,
      signal: expect.any(AbortSignal),
    });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('serializes credential refreshes so an older result cannot finish last', async () => {
    let finishFirst: (() => void) | undefined;
    mocks.refreshModelAvailability
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishFirst = resolve;
      }))
      .mockResolvedValueOnce({
        sharedModel: null,
        updatedChatSessions: 0,
        updatedAppSessions: 0,
      });

    const first = refreshModelAvailabilityAfterCredentialChange('first');
    const second = refreshModelAvailabilityAfterCredentialChange('second');
    await vi.waitFor(() => expect(mocks.refreshModelAvailability).toHaveBeenCalledTimes(1));
    finishFirst?.();
    await Promise.all([first, second]);

    expect(mocks.refreshModelAvailability).toHaveBeenCalledTimes(2);
  });
});
