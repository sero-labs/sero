import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getProviderApiKey } from '@electron/features/apps/runtime/capabilities/provider-credentials';

describe('getProviderApiKey', () => {
  it('prefers process env', async () => {
    const result = await getProviderApiKey('anthropic', '/nonexistent', { ANTHROPIC_API_KEY: 'sk-env' });
    expect(result).toEqual({ envVar: 'ANTHROPIC_API_KEY', key: 'sk-env' });
  });

  it('falls back to auth.json', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'sero-cred-'));
    await mkdir(path.join(home, 'agent'), { recursive: true });
    await writeFile(path.join(home, 'agent', 'auth.json'), JSON.stringify({ anthropic: { type: 'api_key', key: 'sk-file' } }));
    const result = await getProviderApiKey('anthropic', home, {});
    expect(result).toEqual({ envVar: 'ANTHROPIC_API_KEY', key: 'sk-file' });
  });

  it('returns null for unknown provider or missing key', async () => {
    expect(await getProviderApiKey('unknown', '/nonexistent', {})).toBeNull();
    expect(await getProviderApiKey('anthropic', '/nonexistent', {})).toBeNull();
  });
});
