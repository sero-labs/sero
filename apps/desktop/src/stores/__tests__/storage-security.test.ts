import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStorageSecurityStore } from '@/stores/storage-security';

const persistLayout = vi.hoisted(() => vi.fn());
vi.mock('@/lib/persist-layout', () => ({ persistLayout }));

function setBridge(status: unknown, reject = false): void {
  (window as unknown as { sero: unknown }).sero = {
    safeStorage: {
      status: reject
        ? vi.fn().mockRejectedValue(new Error('ipc down'))
        : vi.fn().mockResolvedValue(status),
    },
  };
}

beforeEach(() => {
  persistLayout.mockClear();
  useStorageSecurityStore.setState({ status: null, bannerDismissed: false });
});

describe('storage security store', () => {
  it('records an insecure result', async () => {
    setBridge({ secure: false, reason: 'no keyring', remedy: 'install one' });
    await useStorageSecurityStore.getState().check();

    expect(useStorageSecurityStore.getState().status).toEqual({
      secure: false,
      reason: 'no keyring',
      remedy: 'install one',
    });
  });

  it('stays null when the check fails, so no surface claims a problem', async () => {
    setBridge(null, true);
    await useStorageSecurityStore.getState().check();

    // A failed check must not be reported as insecure — that would warn users
    // about a condition we never actually observed.
    expect(useStorageSecurityStore.getState().status).toBeNull();
  });

  it('persists the dismissal rather than only setting it in memory', () => {
    useStorageSecurityStore.getState().dismissBanner();

    expect(useStorageSecurityStore.getState().bannerDismissed).toBe(true);
    expect(persistLayout).toHaveBeenCalledWith({ storageWarningDismissed: true });
  });

  it('hydrates the dismissal from a persisted layout', () => {
    useStorageSecurityStore.getState().hydrateDismissed(true);
    expect(useStorageSecurityStore.getState().bannerDismissed).toBe(true);
    // Hydration is not a user action, so it must not write back.
    expect(persistLayout).not.toHaveBeenCalled();
  });

  it('keeps status independent of dismissal, so the status bar stays visible', async () => {
    setBridge({ secure: false, reason: 'no keyring', remedy: null });
    await useStorageSecurityStore.getState().check();
    useStorageSecurityStore.getState().dismissBanner();

    const state = useStorageSecurityStore.getState();
    expect(state.bannerDismissed).toBe(true);
    expect(state.status?.secure).toBe(false);
  });
});
