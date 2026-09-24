import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile manager', () => {
  let tmpHome: string | null = null;
  const originalFixedRootOverride = process.env.SERO_FIXED_ROOT_OVERRIDE;

  async function importManager() {
    if (!tmpHome) {
      throw new Error('tmpHome not initialized');
    }

    vi.resetModules();
    // State the root explicitly instead of inferring it from a swapped HOME.
    // SERO_HOME_OVERRIDE stays unset so the first-profile default-root branch
    // stays under test.
    process.env.SERO_FIXED_ROOT_OVERRIDE = tmpHome;
    delete process.env.SERO_HOME_OVERRIDE;
    return import('@electron/features/profile/manager');
  }

  afterEach(async () => {
    vi.resetModules();
    if (originalFixedRootOverride === undefined) {
      delete process.env.SERO_FIXED_ROOT_OVERRIDE;
    } else {
      process.env.SERO_FIXED_ROOT_OVERRIDE = originalFixedRootOverride;
    }

    if (tmpHome) {
      await fs.rm(tmpHome, { recursive: true, force: true });
      tmpHome = null;
    }
  });

  it('allows managed child profiles beneath the default profile root', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-'));

    const { profileManager } = await importManager();

    const defaultProfile = await profileManager.create('Default');
    const workProfile = await profileManager.create('Work');

    expect(defaultProfile.path).toBe(tmpHome);
    expect(workProfile.path).toBe(path.join(tmpHome, 'profiles', 'work'));
  });

  it('uses SERO_HOME_OVERRIDE as the isolated profile registry root', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-override-'));

    vi.resetModules();
    process.env.HOME = path.join(tmpHome, 'real-home');
    process.env.SERO_HOME_OVERRIDE = path.join(tmpHome, 'isolated-home');

    const { profileManager, PROFILE_REGISTRY_PATH } = await import('@electron/features/profile/manager');

    const defaultProfile = await profileManager.create('Default');
    const workProfile = await profileManager.create('Work');

    expect(PROFILE_REGISTRY_PATH).toBe(path.join(tmpHome, 'isolated-home', 'profiles.json'));
    expect(defaultProfile.path).toBe(path.join(tmpHome, 'isolated-home', 'profiles', 'default'));
    expect(workProfile.path).toBe(path.join(tmpHome, 'isolated-home', 'profiles', 'work'));
  });

  it('repairs isolated profiles that were created at the override root', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-override-repair-'));
    const isolatedHome = path.join(tmpHome, 'isolated-home');
    await fs.mkdir(isolatedHome, { recursive: true });
    await fs.writeFile(path.join(isolatedHome, 'profiles.json'), JSON.stringify({
      version: 1,
      activeProfileId: 'contaminated',
      profiles: [{
        id: 'contaminated',
        name: 'Contaminated',
        path: isolatedHome,
        createdAt: '2026-06-02T00:00:00.000Z',
      }],
    }, null, 2));

    vi.resetModules();
    process.env.HOME = path.join(tmpHome, 'real-home');
    process.env.SERO_HOME_OVERRIDE = isolatedHome;

    const { profileManager } = await import('@electron/features/profile/manager');

    expect(profileManager.getActive()?.path).toBe(path.join(isolatedHome, 'profiles', 'contaminated'));
  });

  it('rejects duplicate and overlapping custom profile roots', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-overlap-'));

    const { profileManager } = await importManager();
    const basePath = path.join(tmpHome, 'custom-profiles', 'work');

    await profileManager.create('Work', basePath);

    await expect(profileManager.create('Duplicate', basePath)).rejects.toThrow(
      'already belongs to profile',
    );
    await expect(
      profileManager.create('Nested', path.join(basePath, 'nested')),
    ).rejects.toThrow('overlaps with existing profile');
    await expect(
      profileManager.create('Parent', path.join(tmpHome, 'custom-profiles')),
    ).rejects.toThrow('overlaps with existing profile');
  });

  it('rejects using the default sero root as a later custom profile path', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-root-'));

    const { profileManager } = await importManager();
    await profileManager.create('Work', path.join(tmpHome, 'profiles', 'work'));

    await expect(
      profileManager.create('Default-ish', tmpHome),
    ).rejects.toThrow('reserved for the first default profile');
  });

  it('adopts a profile directory that already exists without touching its files', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-adopt-'));
    const profilePath = path.join(tmpHome, 'profiles', 'studio');
    await fs.mkdir(path.join(profilePath, 'agent'), { recursive: true });
    await fs.writeFile(
      path.join(profilePath, 'agent', 'workspaces.json'),
      '{"workspaces":[{"id":"w1"}]}',
    );
    const before = (await fs.readdir(profilePath, { recursive: true })).sort();

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt({ id: 'recorded-id', name: 'Studio', path: profilePath });

    expect(entry.id).toBe('recorded-id');
    expect(entry.path).toBe(profilePath);
    expect(entry.folderProvenance).toBe('sero-managed');
    expect(profileManager.getActiveId()).toBe('recorded-id');
    expect(profileManager.findById('recorded-id')?.name).toBe('Studio');
    await expect(fs.readdir(profilePath, { recursive: true })).resolves.toEqual(before);
  });

  it('adopts a profile at the default root when the registry is empty', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-adopt-default-'));

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt({ name: 'Default', path: tmpHome });

    expect(entry.path).toBe(tmpHome);
    expect(entry.folderProvenance).toBe('default-root');
    expect(profileManager.getActiveId()).toBe(entry.id);
  });

  it('refuses to adopt an already registered path and leaves the registry unchanged', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-adopt-dup-'));

    const { profileManager } = await importManager();
    const created = await profileManager.create('Default', undefined, true);
    const before = profileManager.list();

    await expect(
      profileManager.adopt({ name: 'Copy', path: created.path }),
    ).rejects.toThrow('already registered');

    expect(profileManager.list()).toEqual(before);
  });
});
