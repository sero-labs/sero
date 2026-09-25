import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { McpOAuthProvider } from '../auth/oauth-provider';
import { resolvePrincipalId } from '../auth/principal';
import { clearOAuthTokens, readOAuthTokens } from '../auth/storage';
import { getMcpOAuthTokenPath } from '../state/paths';
import type { McpServerConfig } from '../config/types';

const URL = 'https://mcp.example.com/mcp';
const OAUTH: McpServerConfig = { transport: 'http', url: URL, auth: 'oauth' };
let home = '';

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'mcp-principal-'));
  process.env.SERO_HOME = home;
  process.env.PI_CODING_AGENT_DIR = home;
});

const provider = (newAuthorization: boolean) => new McpOAuthProvider('crm', URL, {}, { onRedirect: () => {} }, { newAuthorization });
const token = (access: string) => ({ access_token: access, token_type: 'Bearer' });

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => readFile(path.join(entry.parentPath, entry.name), 'utf8')));
}

describe('resolvePrincipalId', () => {
  it('gives each new authorization its own ID and keeps it across a token refresh', async () => {
    await provider(true).saveTokens(token('first'));
    const first = await resolvePrincipalId('crm', OAUTH);
    await provider(false).saveTokens(token('refreshed'));
    expect(await resolvePrincipalId('crm', OAUTH)).toBe(first);

    await provider(true).saveTokens(token('second'));
    const second = await resolvePrincipalId('crm', OAUTH);
    expect(first).toMatch(/^oauth:/);
    expect(second).not.toBe(first);
  });

  it('assigns a stable ID to tokens saved before principals existed', async () => {
    const tokenPath = getMcpOAuthTokenPath('crm');
    await mkdir(path.dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, JSON.stringify({ accessToken: 'old', serverUrl: URL }));
    const assigned = await resolvePrincipalId('crm', OAUTH);

    expect(assigned).toMatch(/^oauth:/);
    expect(await resolvePrincipalId('crm', OAUTH)).toBe(assigned);
    expect((await readOAuthTokens('crm', URL))?.tokens.access_token).toBe('old');
  });

  it('drops the OAuth principal on sign-out', async () => {
    await provider(true).saveTokens(token('first'));
    await clearOAuthTokens('crm');

    expect(await resolvePrincipalId('crm', OAUTH)).toBe('anon');
  });

  it('hashes a bearer token and writes nothing to disk', async () => {
    const secret = 'secret-bearer-token-123';
    const id = await resolvePrincipalId('api', { transport: 'http', url: URL, auth: 'bearer', bearerToken: secret });

    expect(id).toMatch(/^bearer:[0-9a-f]{64}$/);
    expect(id).not.toContain(secret);
    expect((await filesUnder(home)).some((content) => content.includes(secret))).toBe(false);
    expect(await resolvePrincipalId('local', { command: 'node' })).toBe('anon');
  });
});
