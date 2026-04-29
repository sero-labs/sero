import { describe, expect, it } from 'vitest';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import {
  getAutoConnectServerEntries,
  getChangedServerNames,
  getKeepAliveServerEntries,
  shouldAttemptAutoConnect,
} from '../runtime/runtime-lifecycle';

function createConfig(servers: Record<string, McpServerConfig>): McpConfigDocument {
  return { mcpServers: servers };
}

describe('runtime-lifecycle helpers', () => {
  it('returns only enabled eager and keep-alive servers for auto-connect', () => {
    const config = createConfig({
      lazy: { command: 'node', lifecycle: 'lazy' },
      eager: { command: 'node', lifecycle: 'eager' },
      keepAlive: { command: 'node', lifecycle: 'keep-alive' },
      disabled: { command: 'node', lifecycle: 'keep-alive', enabled: false },
    });

    expect(getAutoConnectServerEntries(config).map(([name]) => name)).toEqual(['eager', 'keepAlive']);
    expect(getKeepAliveServerEntries(config).map(([name]) => name)).toEqual(['keepAlive']);
  });

  it('skips auto-connect for connected or auth-blocked servers', async () => {
    const connected = await shouldAttemptAutoConnect({
      serverName: 'github',
      serverConfig: { command: 'node', lifecycle: 'keep-alive' },
      connection: {
        name: 'github',
        client: null,
        transport: null,
        tools: [],
        resources: [],
        status: 'connected',
      },
      hasOAuthTokens: async () => false,
    });
    const oauthWithoutTokens = await shouldAttemptAutoConnect({
      serverName: 'oauth-server',
      serverConfig: { url: 'https://example.com/mcp', auth: 'oauth', lifecycle: 'keep-alive' },
      hasOAuthTokens: async () => false,
    });

    expect(connected).toBe(false);
    expect(oauthWithoutTokens).toBe(false);
  });

  it('reports removed and transport-changing servers as changed', () => {
    const previousConfig = createConfig({
      github: { command: 'node', args: ['old'] },
      memory: { command: 'npx' },
    });
    const nextConfig = createConfig({
      github: { url: 'https://example.com/mcp', transport: 'http' },
      newServer: { command: 'bunx' },
    });

    expect(getChangedServerNames(previousConfig, nextConfig).sort()).toEqual(['github', 'memory']);
  });
});
