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
});
