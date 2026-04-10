import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  copyProfileDataSync,
  profileHasTransferableData,
} from '@electron/features/profile/copy-profile-data';

const tempDirs: string[] = [];

async function createProfileDir(prefix: string): Promise<{ profileHome: string; agentDir: string }> {
  const profileHome = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(profileHome);
  const agentDir = path.join(profileHome, 'agent');
  await mkdir(agentDir, { recursive: true });
  return { profileHome, agentDir };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('profile copy helpers', () => {
  it('treats env-backed credentials and local model config as transferable profile data', async () => {
    const { profileHome, agentDir } = await createProfileDir('sero-profile-copy-source-');

    expect(profileHasTransferableData(profileHome)).toBe(false);

    await writeFile(path.join(agentDir, '.env'), '# comment\nOPENAI_API_KEY=test-key\n', 'utf8');
    expect(profileHasTransferableData(profileHome)).toBe(true);

    await writeFile(path.join(agentDir, '.env'), '# comment only\n', 'utf8');
    await writeFile(path.join(agentDir, 'models.json'), '{"providers":{"ollama":{"baseUrl":"http://127.0.0.1:11434"}}}\n', 'utf8');
    expect(profileHasTransferableData(profileHome)).toBe(true);
  });

  it('preserves the source thinking default when legacy model defaults exist without tier settings', async () => {
    const source = await createProfileDir('sero-profile-copy-source-');
    const dest = await createProfileDir('sero-profile-copy-dest-');

    await writeFile(path.join(source.agentDir, 'provider-model-defaults.json'), '{"openai":{"HIGH":"gpt-5"}}\n', 'utf8');
    await writeFile(
      path.join(source.agentDir, 'settings.json'),
      JSON.stringify({ defaultThinkingLevel: 'medium' }, null, 2) + '\n',
      'utf8',
    );

    copyProfileDataSync(source.profileHome, dest.profileHome);

    const destSettings = JSON.parse(
      await readFile(path.join(dest.agentDir, 'settings.json'), 'utf8'),
    ) as { defaultThinkingLevel?: string };

    expect(destSettings.defaultThinkingLevel).toBe('medium');
    expect(await readFile(path.join(dest.agentDir, 'provider-model-defaults.json'), 'utf8')).toContain('gpt-5');
  });

  it('copies transferable config files and model preferences into the new profile', async () => {
    const source = await createProfileDir('sero-profile-copy-source-');
    const dest = await createProfileDir('sero-profile-copy-dest-');

    await writeFile(path.join(source.agentDir, '.env'), 'OPENAI_API_KEY=test-key\n', 'utf8');
    await writeFile(path.join(source.agentDir, 'auth.json'), '{"anthropic":{"apiKey":"test"}}\n', 'utf8');
    await writeFile(path.join(source.agentDir, 'github-auth.json'), '{"username":"octocat"}\n', 'utf8');
    await writeFile(path.join(source.agentDir, 'google-auth.json'), '{"email":"user@example.com"}\n', 'utf8');
    await writeFile(path.join(source.agentDir, 'gateway-config.json'), '{"maxCostPerDay":10}\n', 'utf8');
    await writeFile(path.join(source.agentDir, 'gateway-token'), 'gateway-secret', 'utf8');
    await writeFile(path.join(source.agentDir, 'gateway-web-tokens.json'), '[{"label":"web"}]\n', 'utf8');
    await writeFile(
      path.join(source.agentDir, 'models.json'),
      '{"providers":{"ollama":{"baseUrl":"http://127.0.0.1:11434"}}}\n',
      'utf8',
    );
    await writeFile(path.join(source.agentDir, 'provider-model-defaults.json'), '{"openai":{"HIGH":"gpt-5"}}\n', 'utf8');
    await writeFile(
      path.join(source.agentDir, 'settings.json'),
      JSON.stringify({
        defaultThinkingLevel: 'medium',
        sero: {
          modelTiers: {
            HIGH: { provider: 'openai', modelId: 'gpt-5', thinkingLevel: 'medium' },
          },
        },
      }, null, 2) + '\n',
      'utf8',
    );

    copyProfileDataSync(source.profileHome, dest.profileHome);

    expect(await readFile(path.join(dest.agentDir, '.env'), 'utf8')).toContain('OPENAI_API_KEY');
    expect(await readFile(path.join(dest.agentDir, 'auth.json'), 'utf8')).toContain('anthropic');
    expect(await readFile(path.join(dest.agentDir, 'github-auth.json'), 'utf8')).toContain('octocat');
    expect(await readFile(path.join(dest.agentDir, 'google-auth.json'), 'utf8')).toContain('user@example.com');
    expect(await readFile(path.join(dest.agentDir, 'gateway-config.json'), 'utf8')).toContain('maxCostPerDay');
    expect(await readFile(path.join(dest.agentDir, 'gateway-token'), 'utf8')).toBe('gateway-secret');
    expect(await readFile(path.join(dest.agentDir, 'gateway-web-tokens.json'), 'utf8')).toContain('web');
    expect(await readFile(path.join(dest.agentDir, 'models.json'), 'utf8')).toContain('ollama');
    expect(await readFile(path.join(dest.agentDir, 'provider-model-defaults.json'), 'utf8')).toContain('gpt-5');

    const destSettings = JSON.parse(
      await readFile(path.join(dest.agentDir, 'settings.json'), 'utf8'),
    ) as {
      defaultThinkingLevel?: string;
      sero?: { modelTiers?: { HIGH?: { provider?: string; modelId?: string; thinkingLevel?: string } } };
    };

    expect(destSettings.defaultThinkingLevel).toBe('medium');
    expect(destSettings.sero?.modelTiers?.HIGH).toEqual({
      provider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'medium',
    });
    expect(existsSync(path.join(dest.agentDir, 'auth.json'))).toBe(true);
  });
});
