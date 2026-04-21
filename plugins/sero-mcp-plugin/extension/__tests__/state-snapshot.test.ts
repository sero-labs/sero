import { describe, expect, it } from 'vitest';
import { computeServerHash } from '../cache/metadata-cache';
import type { McpConfigDocument, McpServerConfig } from '../config/types';
import { buildSnapshot } from '../state/snapshot';

function createConfig(serverConfig: McpServerConfig): McpConfigDocument {
  return {
    mcpServers: {
      demo: serverConfig,
    },
  };
}

describe('buildSnapshot', () => {
  it('preserves UI tool resource URIs so the UI can launch them', async () => {
    const serverConfig: McpServerConfig = {
      command: 'node',
      args: ['server.js'],
    };
    const config = createConfig(serverConfig);

    const snapshot = await buildSnapshot({
      configPath: '/tmp/mcp.json',
      rawConfigUpdatedAt: null,
      config,
      metadataCache: {
        version: 1,
        servers: {
          demo: {
            cachedAt: Date.now(),
            configHash: computeServerHash(serverConfig),
            toolCount: 1,
            resourceCount: 0,
            tools: [
              {
                name: 'open_dashboard',
                description: 'Open the dashboard UI',
                inputSchema: { type: 'object' },
                uiResourceUri: 'ui://demo/dashboard',
              },
            ],
            resources: [],
          },
        },
      },
      hasOAuthTokens: async () => false,
    });

    expect(snapshot.servers[0]?.uiToolCount).toBe(1);
    expect(snapshot.servers[0]?.uiTools).toEqual([
      {
        name: 'open_dashboard',
        description: 'Open the dashboard UI',
        inputSchema: { type: 'object' },
        resourceUri: 'ui://demo/dashboard',
      },
    ]);
  });

  it('hides resource inventory when resource exposure is disabled', async () => {
    const serverConfig: McpServerConfig = {
      command: 'node',
      args: ['server.js'],
      exposeResources: false,
    };
    const config = createConfig(serverConfig);

    const snapshot = await buildSnapshot({
      configPath: '/tmp/mcp.json',
      rawConfigUpdatedAt: null,
      config,
      metadataCache: {
        version: 1,
        servers: {
          demo: {
            cachedAt: Date.now(),
            configHash: computeServerHash(serverConfig),
            toolCount: 0,
            resourceCount: 1,
            tools: [],
            resources: [
              {
                uri: 'file://README.md',
                name: 'README',
                description: 'Repository readme',
              },
            ],
          },
        },
      },
      hasOAuthTokens: async () => false,
    });

    expect(snapshot.servers[0]?.resourceCount).toBe(0);
    expect(snapshot.servers[0]?.resources).toEqual([]);
  });

  it('marks bearer auth as needing auth when its env var is missing', async () => {
    const previousToken = process.env.MCP_TEST_TOKEN;
    delete process.env.MCP_TEST_TOKEN;

    try {
      const serverConfig: McpServerConfig = {
        url: 'https://example.com/mcp',
        transport: 'http',
        auth: 'bearer',
        bearerTokenEnv: 'MCP_TEST_TOKEN',
      };
      const config = createConfig(serverConfig);

      const snapshot = await buildSnapshot({
        configPath: '/tmp/mcp.json',
        rawConfigUpdatedAt: null,
        config,
        metadataCache: { version: 1, servers: {} },
        hasOAuthTokens: async () => false,
      });

      expect(snapshot.servers[0]?.authStatus).toBe('not-authenticated');
      expect(snapshot.servers[0]?.connectionStatus).toBe('needs-auth');
    } finally {
      if (previousToken === undefined) {
        delete process.env.MCP_TEST_TOKEN;
      } else {
        process.env.MCP_TEST_TOKEN = previousToken;
      }
    }
  });
});
