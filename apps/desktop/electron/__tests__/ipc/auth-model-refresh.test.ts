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

    await expect(refreshModelAvailabilityAfterCredentialChange()).resolves.toBeUndefined();

    expect(consoleWarn).toHaveBeenCalledWith(
      '[auth] Credentials changed but model refresh failed:',
      expect.any(Error),
    );
  });

  it('still awaits a successful refresh when reconciliation succeeds', async () => {
    mocks.refreshModelAvailability.mockResolvedValue({
      sharedModel: null,
      updatedChatSessions: 0,
      updatedAppSessions: 0,
    });

    await expect(refreshModelAvailabilityAfterCredentialChange()).resolves.toBeUndefined();

    expect(mocks.refreshModelAvailability).toHaveBeenCalledOnce();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
