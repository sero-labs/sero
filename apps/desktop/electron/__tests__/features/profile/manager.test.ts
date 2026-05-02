import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile manager path validation', () => {
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

  it('allows managed child profiles beneath the default profile root', async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-manager-'));

    const { profileManager } = await importManager();

    const defaultProfile = await profileManager.create('Default');
    const workProfile = await profileManager.create('Work');

    expect(defaultProfile.path).toBe(path.join(tmpHome, '.sero-ui'));
    expect(workProfile.path).toBe(path.join(tmpHome, '.sero-ui', 'profiles', 'work'));
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
      profileManager.create('Default-ish', path.join(tmpHome, '.sero-ui')),
    ).rejects.toThrow('reserved for the first default profile');
  });
});
