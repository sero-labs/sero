import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UnauthorizedError } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpOAuthCoordinator } from '../auth/oauth-coordinator';
import { hasOAuthTokens } from '../auth/storage';
import type { McpServerConfig } from '../config/types';
import { McpServerManager } from '../manager/server-manager';
import { startOAuthTestServer, type OAuthTestServer } from './helpers/oauth-server';

let server: OAuthTestServer;
let coordinator: McpOAuthCoordinator;
let definition: McpServerConfig;
const managers: McpServerManager[] = [];

beforeEach(async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-oauth-step-up-'));
  process.env.SERO_HOME = home;
  process.env.PI_CODING_AGENT_DIR = home;
  server = await startOAuthTestServer({
    createMcpServer: () => {
      const mcp = new McpServer({ name: 'crm', version: '1.0.0' });
      mcp.registerTool('update_contact', { description: 'Update a contact.' }, async () => ({
        content: [{ type: 'text', text: 'updated' }],
      }));
      return mcp;
    },
  });
  coordinator = new McpOAuthCoordinator();
  definition = { transport: 'http', url: server.url, auth: 'oauth' };
});

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.closeAll()));
  await coordinator.cancelAll();
  await server.close();
});

/** Signs in the way the MCP app does; the authorization server grants the scope that the URL asks for. */
async function signIn(): Promise<string> {
  const started = await coordinator.startAuth('crm', definition);
  expect(started.status).toBe('pending');
  const authUrl = new URL(started.authUrl!);
  const scope = authUrl.searchParams.get('scope') ?? '';
  const callback = new URL('http://127.0.0.1:19876/mcp/oauth/callback');
  callback.searchParams.set('code', `scope:${scope}`);
  callback.searchParams.set('state', authUrl.searchParams.get('state')!);
  callback.searchParams.set('iss', server.issuer);
  await coordinator.completeAuth('crm', callback.toString());
  return scope;
}

async function connect(): Promise<McpServerManager> {
  const manager = new McpServerManager({ hasOAuthTokens });
  managers.push(manager);
  const connection = await manager.connect('crm', definition);
  expect(connection.status).toBe('connected');
  return manager;
}

describe('OAuth scope step-up', () => {
  it('asks for the wider scope at the next sign-in, and the call then succeeds', async () => {
    await signIn();
    const before = await connect();
    server.requireScopeForToolCalls('crm.write');

    await expect(before.callTool('crm', 'update_contact', {})).rejects.toBeInstanceOf(UnauthorizedError);

    const grantedScope = await signIn();
    expect(grantedScope.split(' ')).toContain('crm.write');
    const after = await connect();
    await expect(after.callTool('crm', 'update_contact', {})).resolves.toMatchObject({
      content: [{ type: 'text', text: 'updated' }],
    });
  });
});
