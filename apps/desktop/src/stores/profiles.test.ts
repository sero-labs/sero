// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adoptProfile, loadProfiles, useProfileStore } from './profiles';
import type { DiscoveredProfile, ProfileInfo } from '@/types/profile';

const profileBridge = {
  list: vi.fn(),
  getActive: vi.fn(),
  hasActive: vi.fn(),
  discover: vi.fn(),
  adopt: vi.fn(),
  create: vi.fn(),
  switch: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  pickFolder: vi.fn(),
  needsOnboarding: vi.fn(),
  markOnboardingDone: vi.fn(),
  listAuthSources: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function installBridge(): void {
  Object.defineProperty(window, 'sero', {
    configurable: true,
    value: { profiles: profileBridge },
  });
}

function resetStore(): void {
  useProfileStore.setState({
    profiles: [],
    discoveredProfiles: [],
    activeProfile: null,
    ready: false,
    hasActiveProfile: false,
    isLoading: false,
    error: null,
  });
}

const activeProfile: ProfileInfo = {
  id: 'a',
  name: 'Alpha',
  path: '/p/a',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  canDeleteFiles: false,
};

const discovered: DiscoveredProfile[] = [
  { id: 'cand', name: 'Studio', path: '/p/studio', lastModified: '2026-09-20T13:08:15.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  installBridge();
});

afterEach(() => {
  resetStore();
  if (originalSeroDescriptor) {
    Object.defineProperty(window, 'sero', originalSeroDescriptor);
  } else {
    Reflect.deleteProperty(window, 'sero');
  }
});

describe('profile store', () => {
  it('hydrates registered and on-disk profiles on startup', async () => {
    profileBridge.hasActive.mockResolvedValue(true);
    profileBridge.list.mockResolvedValue([activeProfile]);
    profileBridge.getActive.mockResolvedValue(activeProfile);
    profileBridge.discover.mockResolvedValue(discovered);

    await loadProfiles();

    const state = useProfileStore.getState();
    expect(state.ready).toBe(true);
    expect(state.hasActiveProfile).toBe(true);
    expect(state.profiles).toEqual([activeProfile]);
    expect(state.discoveredProfiles).toEqual(discovered);
  });

  it('adopts a discovered profile through the bridge', async () => {
    profileBridge.adopt.mockResolvedValue(undefined);

    await adoptProfile({ id: 'cand', name: 'Studio', path: '/p/studio' });

    expect(profileBridge.adopt).toHaveBeenCalledWith({
      id: 'cand',
      name: 'Studio',
      path: '/p/studio',
    });
  });

  it('reports an adoption failure and clears the loading flag', async () => {
    profileBridge.adopt.mockRejectedValue(new Error('Adopt blocked'));

    await expect(adoptProfile({ name: 'Studio', path: '/p/studio' })).rejects.toThrow('Adopt blocked');

    const state = useProfileStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toContain('Adopt blocked');
  });
});
