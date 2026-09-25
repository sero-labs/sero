import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { McpOAuthProvider } from '../auth/oauth-provider';
import { getMcpOAuthClientPath, getMcpOAuthTokenPath } from '../state/paths';

const URL = 'https://mcp.example.com/mcp';
const ISSUER = 'https://auth.example.com';

beforeEach(async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-oauth-'));
  process.env.SERO_HOME = home;
  process.env.PI_CODING_AGENT_DIR = home;
});

const provider = () => new McpOAuthProvider('crm', URL, {}, { onRedirect: () => {} });

async function writeRaw(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value));
}

describe('McpOAuthProvider storage', () => {
  it('returns saved tokens and client information with their issuer stamp', async () => {
    await provider().saveTokens({ access_token: 'a', token_type: 'Bearer', refresh_token: 'r', expires_in: 3600, issuer: ISSUER });
    await provider().saveClientInformation({ client_id: 'client-1', issuer: ISSUER });

    const tokens = await provider().tokens();
    expect(tokens).toMatchObject({ access_token: 'a', token_type: 'Bearer', refresh_token: 'r', issuer: ISSUER });
    expect(tokens?.expires_in).toBeGreaterThan(3590);
    expect(await provider().clientInformation()).toEqual({ client_id: 'client-1', issuer: ISSUER });
  });

  it('keeps the authorization server discovery state', async () => {
    const state = {
      authorizationServerUrl: ISSUER,
      resourceMetadataUrl: `${URL}/.well-known/oauth-protected-resource`,
      authorizationServerMetadata: {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        response_types_supported: ['code'],
      },
    };
    await provider().saveDiscoveryState(state);

    expect(await provider().discoveryState()).toEqual(state);
    await provider().invalidateCredentials('discovery');
    expect(await provider().discoveryState()).toBeUndefined();
  });

  it('loads tokens and client information saved before the upgrade, without an issuer', async () => {
    await writeRaw(getMcpOAuthTokenPath('crm'), { accessToken: 'old-token', refreshToken: 'old-refresh', scope: 'read', serverUrl: URL });
    await writeRaw(getMcpOAuthClientPath('crm'), { clientId: 'old-client', serverUrl: URL });

    expect(await provider().tokens()).toMatchObject({ access_token: 'old-token', refresh_token: 'old-refresh', scope: 'read' });
    expect((await provider().tokens())?.issuer).toBeUndefined();
    expect(await provider().clientInformation()).toMatchObject({ client_id: 'old-client' });
  });
});
