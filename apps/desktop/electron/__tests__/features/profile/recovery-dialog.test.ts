import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showItemInFolder: vi.fn(),
  backupAndResetRegistrySync: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: mocks.showMessageBox,
  },
  shell: {
    showItemInFolder: mocks.showItemInFolder,
  },
}));

vi.mock('@electron/features/profile/manager', () => ({
  backupAndResetRegistrySync: mocks.backupAndResetRegistrySync,
}));

describe('handleProfileRegistryRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backupAndResetRegistrySync.mockReturnValue({
      registryPath: '/tmp/.sero-ui/profiles.json',
      backupPath: '/tmp/.sero-ui/profiles.broken-2026-04-12T10-00-00-000Z.json',
    });
  });

  it('resets the registry and requests a relaunch', async () => {
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery({
      kind: 'malformed_profile_registry',
      registryPath: '/tmp/.sero-ui/profiles.json',
      message: 'profiles.json is malformed: Unexpected token',
    });

    expect(result).toBe('relaunch');
    expect(mocks.backupAndResetRegistrySync).toHaveBeenCalledOnce();
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('lets the user reveal the folder before quitting', async () => {
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 1 })
      .mockResolvedValueOnce({ response: 2 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery({
      kind: 'malformed_profile_registry',
      registryPath: '/tmp/.sero-ui/profiles.json',
      message: 'profiles.json is malformed: Unexpected token',
    });

    expect(result).toBe('quit');
    expect(mocks.showItemInFolder).toHaveBeenCalledWith('/tmp/.sero-ui/profiles.json');
    expect(mocks.backupAndResetRegistrySync).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });
});
