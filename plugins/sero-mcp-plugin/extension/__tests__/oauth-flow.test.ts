import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ISSUER_MISMATCH_MESSAGE, McpOAuthCoordinator } from '../auth/oauth-coordinator';
import { hasOAuthTokens, readOAuthTokens } from '../auth/storage';
import type { McpServerConfig } from '../config/types';
import { McpServerManager } from '../manager/server-manager';
import { startOAuthTestServer, type OAuthTestServer } from './helpers/oauth-server';

let server: OAuthTestServer;
let coordinator: McpOAuthCoordinator;

beforeEach(async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-oauth-flow-'));
  process.env.SERO_HOME = home;
  process.env.PI_CODING_AGENT_DIR = home;
  server = await startOAuthTestServer();
  coordinator = new McpOAuthCoordinator();
});

afterEach(async () => {
  await coordinator.cancelAll();
  await server.close();
});

async function startSignIn() {
  const definition: McpServerConfig = { transport: 'http', url: server.url, auth: 'oauth' };
  const started = await coordinator.startAuth('crm', definition);
  expect(started.status).toBe('pending');
  const state = new URL(started.authUrl!).searchParams.get('state')!;
  const callback = (params: Record<string, string>) => {
    const url = new URL('http://127.0.0.1:19876/mcp/oauth/callback');
    for (const [key, value] of Object.entries({ code: 'auth-code', state, ...params })) url.searchParams.set(key, value);
    return url.toString();
  };
  return { callback };
}

const tokenRequests = () => server.requests.filter((request) => request.path === '/token');

describe('OAuth sign-in callback', () => {
  it('stops before the code exchange when iss names another issuer, and hides the callback text', async () => {
    const { callback } = await startSignIn();

    const attempt = coordinator.completeAuth('crm', callback({ iss: 'https://evil.example.com', error_description: 'Click here' }));

    await expect(attempt).rejects.toThrow(ISSUER_MISMATCH_MESSAGE);
    await expect(attempt).rejects.not.toThrow(/Click here/);
    expect(tokenRequests()).toHaveLength(0);
  });

  it('stops before the code exchange when a required iss is missing', async () => {
    const { callback } = await startSignIn();

    await expect(coordinator.completeAuth('crm', callback({}))).rejects.toThrow();
    expect(tokenRequests()).toHaveLength(0);
  });

  it('stops before the code exchange when the state does not match', async () => {
    const { callback } = await startSignIn();

    await expect(coordinator.completeAuth('crm', callback({ iss: server.issuer, state: 'forged' }))).rejects.toThrow(/state did not match/);
    expect(tokenRequests()).toHaveLength(0);
  });

  it('exchanges the code when state and iss match', async () => {
    const { callback } = await startSignIn();

    await coordinator.completeAuth('crm', callback({ iss: server.issuer }));
    expect(tokenRequests()).toHaveLength(1);
  });
});

describe('OAuth client registration', () => {
  it('registers as a native app when no client ID is configured', async () => {
    await startSignIn();

    const registration = server.requests.find((request) => request.path === '/register');
    expect(registration).toBeDefined();
    expect(JSON.parse(registration!.body)).toMatchObject({
      application_type: 'native',
      redirect_uris: ['http://127.0.0.1:19876/mcp/oauth/callback'],
    });
  });

  it('uses a configured client ID and does not register', async () => {
    const started = await coordinator.startAuth('crm', {
      transport: 'http', url: server.url, auth: 'oauth', oauth: { clientId: 'configured-client' },
    });

    expect(new URL(started.authUrl!).searchParams.get('client_id')).toBe('configured-client');
    expect(server.requests.some((request) => request.path === '/register')).toBe(false);
  });
});

describe('OAuth authorization server change', () => {
  it('does not send stored credentials to a new authorization server and asks for sign-in', async () => {
    const { callback } = await startSignIn();
    await coordinator.completeAuth('crm', callback({ iss: server.issuer }));
    expect((await readOAuthTokens('crm', server.url))?.tokens.issuer).toBe(server.issuer);
    const other = await startOAuthTestServer();
    try {
      server.switchAuthorizationServer(other.issuer);
      const manager = new McpServerManager({ hasOAuthTokens });

      const connection = await manager.connect('crm', { transport: 'http', url: server.url, auth: 'oauth' });
      await manager.closeAll();

      expect(connection.status).toBe('needs-auth');
      expect(other.requests.filter((request) => request.path === '/token' || request.path === '/register')).toHaveLength(0);
      expect(other.requests.some((request) => request.body.includes('issued-token') || request.body.includes('registered-client'))).toBe(false);
    } finally {
      await other.close();
    }
  });
});
