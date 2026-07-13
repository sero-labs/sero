import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  legacyProfileUserDataPath,
  migrateLegacyProfileUserData,
  profileUserDataPath,
} from '@electron/platform/profile-user-data';

describe('profile Chromium user data paths', () => {
  let tmpRoot: string | null = null;

  async function makeTmpRoot(): Promise<string> {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-profile-user-data-'));
    return tmpRoot;
  }

  afterEach(async () => {
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = null;
    }
  });

  it('stores Chromium data inside the active SERO_HOME', () => {
    expect(profileUserDataPath('/profiles/work')).toBe('/profiles/work/chromium-user-data');
  });

  it('resolves the old Electron app-support profile path for migration', () => {
    expect(legacyProfileUserDataPath('/app-support/Electron', 'profile-id')).toBe(
      '/app-support/Electron/profiles/profile-id',
    );
  });

  it('moves legacy Chromium data when the new profile path is empty', async () => {
    const root = await makeTmpRoot();
    const legacyPath = path.join(root, 'Electron', 'profiles', 'active-profile');
    const targetPath = path.join(root, 'profile-home', 'chromium-user-data');
    await fs.mkdir(legacyPath, { recursive: true });
    await fs.writeFile(path.join(legacyPath, 'Preferences'), '{}');

    migrateLegacyProfileUserData(legacyPath, targetPath);

    expect(existsSync(legacyPath)).toBe(false);
    await expect(fs.readFile(path.join(targetPath, 'Preferences'), 'utf8')).resolves.toBe('{}');
  });

  it('leaves legacy data in place when target data already exists', async () => {
    const root = await makeTmpRoot();
    const legacyPath = path.join(root, 'Electron', 'profiles', 'active-profile');
    const targetPath = path.join(root, 'profile-home', 'chromium-user-data');
    await fs.mkdir(legacyPath, { recursive: true });
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(legacyPath, 'Preferences'), 'legacy');
    await fs.writeFile(path.join(targetPath, 'Preferences'), 'target');

    migrateLegacyProfileUserData(legacyPath, targetPath);

    await expect(fs.readFile(path.join(legacyPath, 'Preferences'), 'utf8')).resolves.toBe('legacy');
    await expect(fs.readFile(path.join(targetPath, 'Preferences'), 'utf8')).resolves.toBe('target');
  });
});
