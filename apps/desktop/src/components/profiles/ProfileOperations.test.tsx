// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProfileDialog } from './CreateProfileDialog';
import { ProfileSetup } from './ProfileSetup';
import { ProfileSwitcher } from './ProfileSwitcher';
import { useProfileStore } from '@/stores/profiles';
import type { ProfileInfo } from '@/types/profile';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const profileBridge = {
  create: vi.fn(),
  list: vi.fn(),
  switch: vi.fn(),
  remove: vi.fn(),
  getActive: vi.fn(),
  listAuthSources: vi.fn(),
  pickFolder: vi.fn(),
  hasActive: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function resetProfileStore() {
  useProfileStore.setState({
    profiles: [],
    activeProfile: null,
    ready: true,
    hasActiveProfile: false,
    isLoading: false,
    error: null,
  });
}

function installSeroBridge() {
  Object.defineProperty(window, 'sero', {
    configurable: true,
    value: {
      profiles: profileBridge,
    },
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button as HTMLButtonElement;
}

function findExactButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Expected button with label "${label}"`);
  return button as HTMLButtonElement;
}

function findProfileNameInput(): HTMLInputElement {
  const input = document.querySelector('#profile-name');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected profile name input');
  }
  return input;
}

describe('profile operation error surfaces', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetProfileStore();
    installSeroBridge();

    profileBridge.create.mockResolvedValue({
      id: 'profile-next',
      name: 'Next Profile',
      path: '/profiles/next',
      createdAt: '2026-04-15T00:00:00.000Z',
      isActive: false,
      canDeleteFiles: false,
    });
    profileBridge.list.mockResolvedValue([]);
    profileBridge.switch.mockRejectedValue(new Error('Profile switch blocked'));
    profileBridge.getActive.mockResolvedValue(null);
    profileBridge.listAuthSources.mockResolvedValue([]);
    profileBridge.pickFolder.mockResolvedValue(null);
    profileBridge.hasActive.mockResolvedValue(false);
    profileBridge.remove.mockResolvedValue(undefined);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    resetProfileStore();

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('shows restart-aware activation failures in the first-run profile form', async () => {
    const createdProfile: ProfileInfo = {
      id: 'profile-next',
      name: 'Next Profile',
      path: '/profiles/next',
      createdAt: '2026-04-15T00:00:00.000Z',
      isActive: false,
      canDeleteFiles: false,
    };
    profileBridge.create.mockResolvedValue(createdProfile);
    profileBridge.list.mockResolvedValue([createdProfile]);
    profileBridge.switch.mockRejectedValue(new Error('Could not relaunch into the new profile'));

    await act(async () => {
      root?.render(<ProfileSetup />);
    });

    await act(async () => {
      setInputValue(findProfileNameInput(), 'Work');
    });

    await act(async () => {
      findButton('Get Started').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Could not relaunch into the new profile If the action succeeds, Sero restarts automatically.');
    });
  });

  it('surfaces switch-now failures after creating a new profile', async () => {
    const existingProfile: ProfileInfo = {
      id: 'profile-current',
      name: 'Current',
      path: '/profiles/current',
      createdAt: '2026-04-14T00:00:00.000Z',
      isActive: true,
      canDeleteFiles: false,
    };
    const createdProfile: ProfileInfo = {
      id: 'profile-next',
      name: 'Next Profile',
      path: '/profiles/next',
      createdAt: '2026-04-15T00:00:00.000Z',
      isActive: false,
      canDeleteFiles: false,
    };
    profileBridge.getActive.mockResolvedValue(existingProfile);
    profileBridge.listAuthSources.mockResolvedValue([existingProfile]);
    profileBridge.create.mockResolvedValue(createdProfile);
    profileBridge.list.mockResolvedValue([existingProfile, createdProfile]);
    profileBridge.switch.mockRejectedValue(new Error('The app could not switch profiles'));

    await act(async () => {
      root?.render(<CreateProfileDialog open onOpenChange={vi.fn()} />);
    });

    await act(async () => {
      setInputValue(findProfileNameInput(), 'Next Profile');
    });

    await act(async () => {
      findButton('Create Profile').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Profile Created');
      expect(document.body.textContent).toContain('Switch Now');
    });

    await act(async () => {
      findButton('Switch Now').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('The app could not switch profiles If the action succeeds, Sero restarts automatically.');
    });
  });

  it('keeps the switcher open and shows switch errors inline', async () => {
    const activeProfile: ProfileInfo = {
      id: 'profile-current',
      name: 'Current',
      path: '/profiles/current',
      createdAt: '2026-04-14T00:00:00.000Z',
      isActive: true,
      canDeleteFiles: false,
    };
    const nextProfile: ProfileInfo = {
      id: 'profile-next',
      name: 'Research',
      path: '/profiles/research',
      createdAt: '2026-04-15T00:00:00.000Z',
      isActive: false,
      canDeleteFiles: false,
    };
    useProfileStore.setState({
      profiles: [activeProfile, nextProfile],
      activeProfile,
      ready: true,
      hasActiveProfile: true,
      isLoading: false,
      error: null,
    });
    profileBridge.switch.mockRejectedValue(new Error('Profile registry is busy'));

    await act(async () => {
      root?.render(<ProfileSwitcher />);
    });

    await act(async () => {
      findButton('Current').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      findButton('Research').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Profile registry is busy If the action succeeds, Sero restarts automatically.');
    });

    expect(findButton('Research').disabled).toBe(false);
  });

  it('defaults inactive profile management to file-retaining removal', async () => {
    const active: ProfileInfo = {
      id: 'active', name: 'Current', path: '/profiles/current',
      createdAt: '2026-04-14T00:00:00.000Z', isActive: true, canDeleteFiles: false,
    };
    const custom: ProfileInfo = {
      id: 'custom', name: 'Custom', path: '/custom/profile',
      createdAt: '2026-04-15T00:00:00.000Z', isActive: false, canDeleteFiles: false,
    };
    useProfileStore.setState({ profiles: [active, custom], activeProfile: active, hasActiveProfile: true });
    profileBridge.list.mockResolvedValue([active]);

    await act(async () => { root?.render(<ProfileSwitcher />); });
    await act(async () => { findButton('Current').click(); });
    const manage = document.querySelector('button[aria-label=\"Manage Custom\"]');
    if (!(manage instanceof HTMLButtonElement)) throw new Error('Expected profile management button');
    await act(async () => { manage.click(); });

    expect(document.body.textContent).toContain('Remove profile');
    expect(document.body.textContent).toContain('Choose what to do with the files for Custom.');
    expect(document.body.textContent).not.toContain('Delete files');
    await act(async () => { findExactButton('Retain files').click(); });
    await vi.waitFor(() => expect(profileBridge.remove).toHaveBeenCalledWith('custom', 'remove'));
  });

  it('shows a permanent warning only for a proven Sero-managed profile folder', async () => {
    const active: ProfileInfo = {
      id: 'active', name: 'Current', path: '/profiles/current',
      createdAt: '2026-04-14T00:00:00.000Z', isActive: true, canDeleteFiles: false,
    };
    const managed: ProfileInfo = {
      id: 'managed', name: 'Research', path: '/profiles/research',
      createdAt: '2026-04-15T00:00:00.000Z', isActive: false, canDeleteFiles: true,
      folderProvenance: 'sero-managed',
    };
    useProfileStore.setState({ profiles: [active, managed], activeProfile: active, hasActiveProfile: true });
    profileBridge.list.mockResolvedValue([active]);

    await act(async () => { root?.render(<ProfileSwitcher />); });
    await act(async () => { findButton('Current').click(); });
    const manage = document.querySelector('button[aria-label=\"Manage Research\"]');
    if (!(manage instanceof HTMLButtonElement)) throw new Error('Expected profile management button');
    await act(async () => { manage.click(); });
    await act(async () => { findExactButton('Delete files').click(); });

    expect(document.body.textContent).toContain('Are you sure?');
    expect(document.body.textContent).toContain('You cannot undo this');
    expect(document.body.textContent).toContain('/profiles/research');
    await act(async () => { findExactButton('Delete').click(); });
    await vi.waitFor(() => expect(profileBridge.remove).toHaveBeenCalledWith('managed', 'delete-files'));
  });

  it('does not offer permanent deletion for a custom profile folder', async () => {
    const active: ProfileInfo = {
      id: 'active', name: 'Current', path: '/profiles/current',
      createdAt: '2026-04-14T00:00:00.000Z', isActive: true, canDeleteFiles: false,
    };
    const custom: ProfileInfo = {
      id: 'custom', name: 'Imported', path: '/custom/imported',
      createdAt: '2026-04-15T00:00:00.000Z', isActive: false, canDeleteFiles: false,
      folderProvenance: 'custom',
    };
    useProfileStore.setState({ profiles: [active, custom], activeProfile: active, hasActiveProfile: true });
    profileBridge.list.mockResolvedValue([active]);

    await act(async () => { root?.render(<ProfileSwitcher />); });
    await act(async () => { findButton('Current').click(); });
    const manage = document.querySelector('button[aria-label="Manage Imported"]');
    if (!(manage instanceof HTMLButtonElement)) throw new Error('Expected profile management button');
    await act(async () => { manage.click(); });

    expect(document.body.textContent).not.toContain('Delete files');
    expect(document.body.textContent).toContain('Retain files');
  });
});
