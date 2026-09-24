import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile manager adoption', () => {
  let tmpHome: string | null = null;
  const originalFixedRootOverride = process.env.SERO_FIXED_ROOT_OVERRIDE;

  async function importManager() {
    if (!tmpHome) {
      throw new Error('tmpHome not initialized');
    }

    vi.resetModules();
    // State the root explicitly instead of inferring it from a swapped HOME.
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

  it('adopts a profile directory that already exists without touching its files', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-'));
    const profilePath = path.join(tmpHome, 'profiles', 'studio');
    await fs.mkdir(path.join(profilePath, 'agent'), { recursive: true });
    await fs.writeFile(
      path.join(profilePath, 'agent', 'workspaces.json'),
      '{"workspaces":[{"id":"w1"}]}',
    );
    const before = (await fs.readdir(profilePath, { recursive: true })).sort();

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt(profilePath);

    expect(entry.path).toBe(profilePath);
    expect(entry.name).toBe('studio');
    expect(profileManager.getActiveId()).toBe(entry.id);
    expect(profileManager.findById(entry.id)?.name).toBe('studio');
    await expect(fs.readdir(profilePath, { recursive: true })).resolves.toEqual(before);
  });

  it('keeps ownership unknown for a profile the registry never described', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-unknown-'));
    const profilePath = path.join(tmpHome, 'profiles', 'studio');
    await fs.mkdir(path.join(profilePath, 'agent'), { recursive: true });
    await fs.writeFile(path.join(profilePath, 'agent', 'workspaces.json'), '{"workspaces":[]}');

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt(profilePath);

    // Location alone must not enable permanent deletion.
    expect(entry.folderProvenance).toBeUndefined();
    expect(profileManager.list().find((p) => p.id === entry.id)?.canDeleteFiles).toBe(false);
  });

  it('preserves recorded ownership from the broken registry on adoption', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-recorded-'));
    const customPath = path.join(tmpHome, 'profiles', 'studio');
    await fs.mkdir(path.join(customPath, 'agent'), { recursive: true });
    await fs.writeFile(path.join(customPath, 'agent', 'workspaces.json'), '{"workspaces":[]}');
    await fs.writeFile(
      path.join(tmpHome, 'profiles.broken-2026-09-20T13-08-18-575Z.json'),
      JSON.stringify({
        version: 1,
        activeProfileId: null,
        profiles: [{
          id: 'recorded-id',
          name: 'Studio',
          path: customPath,
          createdAt: '2026-01-01T00:00:00.000Z',
          folderProvenance: 'custom',
          onboarded: true,
        }],
      }),
    );

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt(customPath);

    expect(entry.id).toBe('recorded-id');
    expect(entry.name).toBe('Studio');
    expect(entry.folderProvenance).toBe('custom');
    expect(entry.onboarded).toBe(true);
    // A recorded custom folder stays ineligible for deletion, even under profiles/.
    expect(profileManager.list().find((p) => p.id === entry.id)?.canDeleteFiles).toBe(false);
  });

  it('keeps permanent deletion available when the record proves Sero ownership', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-managed-'));
    const managedPath = path.join(tmpHome, 'profiles', 'work');
    await fs.mkdir(path.join(managedPath, 'agent'), { recursive: true });
    await fs.writeFile(path.join(managedPath, 'agent', 'workspaces.json'), '{"workspaces":[]}');
    await fs.writeFile(
      path.join(tmpHome, 'profiles.broken-2026-09-20T13-08-18-575Z.json'),
      JSON.stringify({
        version: 1,
        activeProfileId: null,
        profiles: [{
          id: 'managed-id',
          name: 'Work',
          path: managedPath,
          createdAt: '2026-01-01T00:00:00.000Z',
          folderProvenance: 'sero-managed',
        }],
      }),
    );

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt(managedPath);

    expect(entry.folderProvenance).toBe('sero-managed');
    expect(profileManager.list().find((p) => p.id === entry.id)?.canDeleteFiles).toBe(true);
  });

  it('adopts the default-root profile when the registry is empty', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-default-'));
    // The first production profile lives at the Sero root and holds profile data.
    await fs.mkdir(path.join(tmpHome, 'agent'), { recursive: true });
    await fs.writeFile(path.join(tmpHome, 'agent', 'settings.json'), '{}');

    const { profileManager } = await importManager();
    const entry = await profileManager.adopt(tmpHome);

    expect(entry.path).toBe(tmpHome);
    expect(entry.name).toBe('Default');
    expect(profileManager.getActiveId()).toBe(entry.id);
  });

  it('refuses to adopt a path with no recoverable profile', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-empty-'));
    const notAProfile = path.join(tmpHome, 'profiles', 'empty');
    await fs.mkdir(notAProfile, { recursive: true });

    const { profileManager } = await importManager();

    await expect(profileManager.adopt(notAProfile)).rejects.toThrow('No recoverable profile');
  });

  it('refuses to adopt an already registered path and leaves the registry unchanged', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-adopt-dup-'));

    const { profileManager } = await importManager();
    const created = await profileManager.create('Default', undefined, true);
    const before = profileManager.list();

    await expect(profileManager.adopt(created.path)).rejects.toThrow('already registered');

    expect(profileManager.list()).toEqual(before);
  });
});
