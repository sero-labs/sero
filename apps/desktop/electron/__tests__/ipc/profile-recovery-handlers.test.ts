import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  relaunch: vi.fn(),
  exit: vi.fn(),
  clearLoadedProfileEnvForRelaunch: vi.fn(),
  adopt: vi.fn(),
  discoverProfiles: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    relaunch: mocks.relaunch,
    exit: mocks.exit,
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    },
  },
}));

vi.mock('@electron/features/profile/manager', () => ({
  PROFILE_REGISTRY_PATH: '/tmp/sero-test/profiles.json',
  profileManager: {
    adopt: mocks.adopt,
    list: vi.fn(() => []),
    findById: vi.fn(() => null),
    getActive: vi.fn(() => null),
    getActiveId: vi.fn(() => null),
    hasProfiles: vi.fn(() => false),
    create: vi.fn(),
    setActive: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    markOnboarded: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock('@electron/features/profile/discovery', () => ({
  discoverProfiles: mocks.discoverProfiles,
}));

vi.mock('@electron/features/workspace/runtime/container-cleanup', () => ({
  containerCleanupService: { requestDeletion: vi.fn() },
  readProfileWorkspaceIdentities: vi.fn(async () => ({ workspaces: [] })),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_FIXED_ROOT: '/tmp/sero-test',
  clearLoadedProfileEnvForRelaunch: mocks.clearLoadedProfileEnvForRelaunch,
}));

vi.mock('@electron/shared/settings/model-config', () => ({
  applyLegacyProviderDefaultsMigration: vi.fn((settings: unknown) => ({ settings, changed: false })),
  buildGlobalModelConfigState: vi.fn(() => ({})),
  setGlobalModelConfig: vi.fn(() => ({})),
}));

vi.mock('@electron/features/onboarding/provider-health', () => ({
  getProviderHealthSnapshot: vi.fn(async () => ({ availableModelGroups: [] })),
}));

vi.mock('@electron/shared/settings/settings-helpers', () => ({
  readSettingsResult: vi.fn(() => ({ ok: true, settings: {} })),
  writeSettings: vi.fn(),
}));

vi.mock('@electron/features/profile/copy-profile-data', () => ({
  copyProfileDataSync: vi.fn(),
  profileHasTransferableData: vi.fn(() => false),
}));

vi.mock('@electron/features/apps/discovery', () => ({
  discoverApps: vi.fn(async () => []),
}));

vi.mock('@electron/ipc/agent-node', () => ({
  disposeAgentNodeService: vi.fn(),
}));

import { registerProfileHandlers } from '@electron/ipc/workspace/profiles';
import { IpcChannels } from '@/types/ipc-channels';

describe('profile recovery IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    registerProfileHandlers();
  });

  it('discovers profiles against the fixed root and registry path', () => {
    const discovered = [
      { id: 'a', name: 'Alpha', path: '/tmp/sero-test/profiles/a', lastModified: '2026-09-20T13:08:15.000Z' },
    ];
    mocks.discoverProfiles.mockReturnValue(discovered);

    const handler = mocks.handlers.get(IpcChannels.profiles.discover);
    expect(handler).toBeTypeOf('function');
    expect(handler?.()).toEqual(discovered);
    expect(mocks.discoverProfiles).toHaveBeenCalledWith({
      seroRoot: '/tmp/sero-test',
      registryPath: '/tmp/sero-test/profiles.json',
    });
  });

  it('adopts the profile at a path, then relaunches', async () => {
    mocks.adopt.mockResolvedValue({ id: 'a', name: 'Alpha', path: '/tmp/sero-test/profiles/a' });

    const handler = mocks.handlers.get(IpcChannels.profiles.adopt);
    expect(handler).toBeTypeOf('function');
    await handler?.({}, '/tmp/sero-test/profiles/a');

    expect(mocks.adopt).toHaveBeenCalledWith('/tmp/sero-test/profiles/a');
    expect(mocks.clearLoadedProfileEnvForRelaunch).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(mocks.exit).toHaveBeenCalledWith(0);
  });
});
