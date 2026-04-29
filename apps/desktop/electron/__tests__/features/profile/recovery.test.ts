import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile registry recovery helpers', () => {
  let tmpHome: string | null = null;
  const originalHome = process.env.HOME;

  async function importManager() {
    if (!tmpHome) {
      throw new Error('tmpHome not initialized');
    }

    vi.resetModules();
    process.env.HOME = tmpHome;
    return import('@electron/features/profile/manager');
  }

  afterEach(async () => {
    vi.resetModules();
    process.env.HOME = originalHome;

    if (tmpHome) {
      await fs.rm(tmpHome, { recursive: true, force: true });
      tmpHome = null;
    }
  });

  it('reports malformed profiles.json through the startup-safe loader', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-recovery-'));

    const registryPath = path.join(tmpHome, '.sero-ui', 'profiles.json');
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

    const registryPath = path.join(tmpHome, '.sero-ui', 'profiles.json');
    const brokenContent = '{still-broken-json';
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, brokenContent, 'utf8');

    const { backupAndResetRegistrySync, readRegistrySync } = await importManager();
    const result = backupAndResetRegistrySync();

    expect(result.registryPath).toBe(registryPath);
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
    await expect(fs.readFile(result.backupPath!, 'utf8')).resolves.toBe(brokenContent);
    expect(readRegistrySync()).toEqual({ version: 1, activeProfileId: null, profiles: [] });
  });
});
