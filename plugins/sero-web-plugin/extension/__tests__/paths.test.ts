import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { getWebConfigDir, getWebConfigPath, getExaUsagePath, getExaUsageReadPath } from '../paths';

const originalSeroHome = process.env.SERO_HOME;
const tempDirs: string[] = [];

afterEach(async () => {
  process.env.SERO_HOME = originalSeroHome;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('web paths', () => {
  it('keeps config and usage files inside the active SERO_HOME profile', async () => {
    const seroHome = await mkdtemp(join(tmpdir(), 'sero-web-home-'));
    tempDirs.push(seroHome);
    process.env.SERO_HOME = seroHome;

    const configDir = join(seroHome, 'apps', 'web');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'web-search.json'), '{}', 'utf8');
    await writeFile(join(configDir, 'exa-usage.json'), '{}', 'utf8');

    expect(getWebConfigDir()).toBe(configDir);
    expect(getWebConfigPath()).toBe(join(configDir, 'web-search.json'));
    expect(getExaUsagePath()).toBe(join(configDir, 'exa-usage.json'));
    expect(getExaUsageReadPath()).toBe(join(configDir, 'exa-usage.json'));
  });
});
