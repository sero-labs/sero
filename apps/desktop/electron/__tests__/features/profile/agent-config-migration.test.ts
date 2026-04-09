import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { migrateLegacyProfileRootConfigsSync } from '../../../features/profile/agent-config-migration';

const tempDirs: string[] = [];

async function createProfileDir(): Promise<{ profileHome: string; agentDir: string }> {
  const profileHome = await mkdtemp(path.join(os.tmpdir(), 'sero-profile-config-migration-'));
  tempDirs.push(profileHome);
  const agentDir = path.join(profileHome, 'agent');
  await mkdir(agentDir, { recursive: true });
  return { profileHome, agentDir };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('migrateLegacyProfileRootConfigsSync', () => {
  it('moves legacy root config files into agent when no target exists', async () => {
    const { profileHome, agentDir } = await createProfileDir();
    const sourcePath = path.join(profileHome, 'gateway-token');
    const untouchedPath = path.join(profileHome, 'profiles.json');

    await writeFile(sourcePath, 'secret-token', 'utf8');
    await writeFile(untouchedPath, '{"ok":true}\n', 'utf8');

    migrateLegacyProfileRootConfigsSync(profileHome, agentDir);

    expect(existsSync(sourcePath)).toBe(false);
    expect(await readFile(path.join(agentDir, 'gateway-token'), 'utf8')).toBe('secret-token');
    expect(existsSync(untouchedPath)).toBe(true);
  });

  it('removes duplicate legacy files when the agent copy already matches', async () => {
    const { profileHome, agentDir } = await createProfileDir();
    const sourcePath = path.join(profileHome, 'feedback.json');
    const targetPath = path.join(agentDir, 'feedback.json');
    const content = '{"rating":"good"}\n';

    await writeFile(sourcePath, content, 'utf8');
    await writeFile(targetPath, content, 'utf8');

    migrateLegacyProfileRootConfigsSync(profileHome, agentDir);

    expect(existsSync(sourcePath)).toBe(false);
    expect(await readFile(targetPath, 'utf8')).toBe(content);
    expect(existsSync(path.join(agentDir, 'legacy-root-configs', 'feedback.json'))).toBe(false);
  });

  it('backs up conflicting legacy files without overwriting the active agent copy', async () => {
    const { profileHome, agentDir } = await createProfileDir();
    const sourcePath = path.join(profileHome, 'gateway-config.json');
    const targetPath = path.join(agentDir, 'gateway-config.json');
    const backupPath = path.join(agentDir, 'legacy-root-configs', 'gateway-config.json');

    await writeFile(sourcePath, '{"maxCostPerDay":10}\n', 'utf8');
    await writeFile(targetPath, '{"maxCostPerDay":50}\n', 'utf8');

    migrateLegacyProfileRootConfigsSync(profileHome, agentDir);

    expect(existsSync(sourcePath)).toBe(false);
    expect(await readFile(targetPath, 'utf8')).toBe('{"maxCostPerDay":50}\n');
    expect(await readFile(backupPath, 'utf8')).toBe('{"maxCostPerDay":10}\n');
  });
});
