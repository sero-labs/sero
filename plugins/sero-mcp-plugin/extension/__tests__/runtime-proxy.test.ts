import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { describe, expect, it, vi } from 'vitest';
import { computeServerHash } from '../cache/metadata-cache';
import type { McpServerConfig } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import { executeProxyAction } from '../runtime/runtime-proxy';
import type { SyncedRuntimeState } from '../runtime/runtime-types';

function createSyncedState(serverConfig: McpServerConfig): SyncedRuntimeState {
  return {
    configPath: '/tmp/mcp.json',
    statePath: '/tmp/mcp-state.json',
    config: {
      mcpServers: {
        github: serverConfig,
      },
    },
    metadataCache: {
      version: 1,
      servers: {
        github: {
          cachedAt: Date.now(),
          configHash: computeServerHash(serverConfig),
          toolCount: 2,
          resourceCount: 1,
          tools: [
            {
              name: 'search_docs',
              description: 'Search repository documentation',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
            },
            {
              name: 'open_dashboard',
              description: 'Open the dashboard UI',
              inputSchema: { type: 'object' },
              uiResourceUri: 'ui://github/dashboard',
            },
          ],
          resources: [
            {
              uri: 'ui://github/dashboard',
              name: 'Dashboard',
              description: 'Embedded GitHub dashboard',
            },
          ],
        },
      },
    },
    rawConfigUpdatedAt: null,
    snapshot: {
      initialized: true,
      firstRun: false,
      configPath: '/tmp/mcp.json',
      rawConfigUpdatedAt: null,
      servers: [
        {
          serverName: 'github',
          enabled: true,
          transport: serverConfig.transport ?? 'stdio',
          lifecycle: serverConfig.lifecycle ?? 'lazy',
          authMode: serverConfig.auth === 'oauth' ? 'oauth' : serverConfig.auth === 'bearer' ? 'bearer' : 'none',
          connectionStatus: serverConfig.auth === 'oauth' ? 'needs-auth' : 'idle',
          authStatus: serverConfig.auth === 'oauth' ? 'not-authenticated' : 'not-required',
          toolCount: 2,
          resourceCount: 1,
          uiToolCount: 1,
          command: serverConfig.command,
          url: serverConfig.url,
          exposeResources: true,
          debug: false,
          lastConnectedAt: null,
          lastFailedAt: null,
          resources: [
            {
              uri: 'ui://github/dashboard',
              name: 'Dashboard',
              description: 'Embedded GitHub dashboard',
            },
          ],
          uiTools: [
            {
              name: 'open_dashboard',
              description: 'Open the dashboard UI',
              inputSchema: { type: 'object' },
              resourceUri: 'ui://github/dashboard',
            },
          ],
        },
      ],
      settings: {
        idleTimeout: 10,
        toolPrefix: 'server',
      },
      lastRefreshedAt: null,
      summary: {
        totalServers: 1,
        enabledServers: 1,
        connectedServers: 0,
        needsAuthServers: serverConfig.auth === 'oauth' ? 1 : 0,
        errorServers: 0,
      },
    },
  };
}

describe('executeProxyAction', () => {
  it('searches cached MCP tools and resources only', async () => {
    const serverConfig: McpServerConfig = { command: 'node', args: ['server.js'] };
    const synced = createSyncedState(serverConfig);
    const result = await executeProxyAction({
      action: 'search',
      query: 'dashboard',
      manager: { getConnection: () => undefined } as unknown as McpServerManager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('[tool] github.open_dashboard');
    expect(text).toContain('[resource] github ui://github/dashboard');
    expect(result.details.matches).toHaveLength(2);
  });

  it('describes a cached tool including its input schema', async () => {
    const serverConfig: McpServerConfig = { command: 'node', args: ['server.js'] };
    const synced = createSyncedState(serverConfig);
    const result = await executeProxyAction({
      action: 'describe_tool',
      serverName: 'github',
      toolName: 'search_docs',
      manager: { getConnection: () => undefined } as unknown as McpServerManager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Tool: github.search_docs');
    expect(text).toContain('Search repository documentation');
    expect(text).toContain('"query"');
  });

  it('calls a live MCP tool and includes structured content in the response', async () => {
    const serverConfig: McpServerConfig = { command: 'node', args: ['server.js'] };
    const synced = createSyncedState(serverConfig);
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: 'Found 2 matching docs.' }],
      structuredContent: { count: 2 },
      isError: false,
    }));
    const manager = {
      getConnection: () => ({
        name: 'github',
        client: null,
        transport: null,
        tools: [
          {
            name: 'search_docs',
            description: 'Search repository documentation',
            inputSchema: { type: 'object' },
          },
        ],
        resources: [],
        status: 'connected' as const,
      }),
      callTool,
    } as unknown as McpServerManager;

    const result = await executeProxyAction({
      action: 'call_tool',
      serverName: 'github',
      toolName: 'search_docs',
      argumentsJson: '{"query":"auth"}',
      manager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    const text = result.content[0]?.text ?? '';
    expect(callTool).toHaveBeenCalledWith('github', 'search_docs', { query: 'auth' });
    expect(text).toContain('MCP tool result from github.search_docs');
    expect(text).toContain('Found 2 matching docs.');
    expect(text).toContain('Structured content:');
    expect(result.details.structuredContent).toEqual({ count: 2 });
  });

  it('returns in-app auth guidance when a tool call hits an OAuth-gated server', async () => {
    const serverConfig: McpServerConfig = {
      url: 'https://example.com/mcp',
      transport: 'http',
      auth: 'oauth',
    };
    const synced = createSyncedState(serverConfig);
    const result = await executeProxyAction({
      action: 'call_tool',
      serverName: 'github',
      toolName: 'search_docs',
      manager: {
        getConnection: () => ({
          name: 'github',
          client: null,
          transport: null,
          tools: [],
          resources: [],
          status: 'needs-auth' as const,
          lastFailedAt: null,
        }),
      } as unknown as McpServerManager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    expect(result.content[0]?.text).toContain('requires in-app authentication');
    expect(result.details.authRequired).toBe(true);
  });

  it('downgrades a connected OAuth server back to auth-required when a live tool call is unauthorized', async () => {
    const serverConfig: McpServerConfig = {
      url: 'https://example.com/mcp',
      transport: 'http',
      auth: 'oauth',
    };
    const synced = createSyncedState(serverConfig);
    const close = vi.fn(async () => {});
    const setRuntimeStatus = vi.fn();
    const result = await executeProxyAction({
      action: 'call_tool',
      serverName: 'github',
      toolName: 'search_docs',
      manager: {
        getConnection: () => ({
          name: 'github',
          client: null,
          transport: null,
          tools: [{ name: 'search_docs', inputSchema: { type: 'object' } }],
          resources: [],
          status: 'connected' as const,
        }),
        callTool: vi.fn(async () => {
          throw new UnauthorizedError('Expired token');
        }),
        close,
      } as unknown as McpServerManager,
      setRuntimeStatus,
      syncSnapshot: async () => synced,
    });

    expect(close).toHaveBeenCalledWith('github');
    expect(setRuntimeStatus).toHaveBeenCalledWith('github', expect.objectContaining({
      connectionStatus: 'needs-auth',
      authStatus: 'not-authenticated',
      lastError: 'Expired token',
    }));
    expect(result.content[0]?.text).toContain('requires in-app authentication');
    expect(result.details.authRequired).toBe(true);
  });
});
