import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile registry recovery helpers', () => {
  let tmpHome: string | null = null;
  const originalSeroHomeOverride = process.env.SERO_HOME_OVERRIDE;

  async function importManager() {
    if (!tmpHome) {
      throw new Error('tmpHome not initialized');
    }

    vi.resetModules();
    // State the root explicitly instead of inferring it from a swapped HOME.
    process.env.SERO_HOME_OVERRIDE = tmpHome;
    return import('@electron/features/profile/manager');
  }

  afterEach(async () => {
    vi.resetModules();
    if (originalSeroHomeOverride === undefined) {
      delete process.env.SERO_HOME_OVERRIDE;
    } else {
      process.env.SERO_HOME_OVERRIDE = originalSeroHomeOverride;
    }

    if (tmpHome) {
      await fs.rm(tmpHome, { recursive: true, force: true });
      tmpHome = null;
    }
  });

  it('reports malformed profiles.json through the startup-safe loader', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-recovery-'));

    const registryPath = path.join(tmpHome, 'profiles.json');
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, '{broken-json', 'utf8');

    const { PROFILE_REGISTRY_PATH, readRegistryLoadSync } = await importManager();
    const result = readRegistryLoadSync();

    expect(PROFILE_REGISTRY_PATH).toBe(registryPath);
    expect(result.error?.message).toContain('profiles.json is malformed');
    expect(result.registry).toEqual({ version: 1, activeProfileId: null, profiles: [] });
  });

  it('backs up the broken registry before resetting it to an empty state', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-recovery-reset-'));

    const registryPath = path.join(tmpHome, 'profiles.json');
    const brokenContent = '{still-broken-json';
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, brokenContent, 'utf8');

    const { readRegistrySync } = await importManager();
    const { backupAndResetRegistrySync } = await import('@electron/features/profile/registry-recovery');
    const result = backupAndResetRegistrySync();

    expect(result.registryPath).toBe(registryPath);
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
    await expect(fs.readFile(result.backupPath!, 'utf8')).resolves.toBe(brokenContent);
    expect(readRegistrySync()).toEqual({ version: 1, activeProfileId: null, profiles: [] });
  });

  it('keeps the profiles whose directories still exist, backing up the broken file', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-recovery-salvage-'));

    const profileA = path.join(tmpHome, 'profiles', 'a');
    const profileB = path.join(tmpHome, 'profiles', 'b');
    await fs.mkdir(path.join(profileA, 'agent'), { recursive: true });
    await fs.mkdir(path.join(profileB, 'agent'), { recursive: true });

    const registryPath = path.join(tmpHome, 'profiles.json');
    const brokenContent = JSON.stringify({
      version: 1,
      activeProfileId: null,
      profiles: [
        { id: 'a', name: 'A', path: profileA, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: 'B', path: profileB, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'gone', name: 'Gone', path: path.join(tmpHome, 'missing'), createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    await fs.writeFile(registryPath, brokenContent, 'utf8');

    // importManager() reloads the module so REGISTRY_PATH points at this temp root.
    const { readRegistrySync } = await importManager();
    const { salvageRegistrySync } = await import('@electron/features/profile/registry-recovery');
    const { selectSalvageCandidates } = await import('@electron/features/profile/discovery');

    const result = salvageRegistrySync(selectSalvageCandidates(registryPath));

    expect(result.kept).toBe(2);
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
    await expect(fs.readFile(result.backupPath!, 'utf8')).resolves.toBe(brokenContent);
    const registry = readRegistrySync();
    expect(registry.profiles.map((profile) => profile.id).sort()).toEqual(['a', 'b']);
    expect(registry.activeProfileId).toBe('a');
  });
});
