import { UnauthorizedError } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { computeServerHash } from '../cache/metadata-cache';
import type { McpServerConfig } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import { executeProxyAction } from '../runtime/runtime-proxy';
import type { SyncedRuntimeState } from '../runtime/runtime-types';
import type { McpTaskRecord } from '../tasks/task-store';

/** A manager mock whose startToolCall returns the result of `call` at once, as for a server without Tasks. */
function startWith(call: (...args: never[]) => Promise<unknown>) {
  return vi.fn(async (...args: never[]) => ({ kind: 'result', result: await call(...args) }));
}

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
      version: 2,
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
          authStatus: serverConfig.auth === 'oauth'
            ? 'not-authenticated'
            : serverConfig.auth === 'bearer'
              ? 'authenticated'
              : 'not-required',
          toolCount: 2,
          resourceCount: 1,
          uiToolCount: 1,
          command: serverConfig.command,
          url: serverConfig.url,
          exposeResources: serverConfig.exposeResources ?? true,
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

  it('lists cached server resources', async () => {
    const serverConfig: McpServerConfig = { command: 'node', args: ['server.js'] };
    const synced = createSyncedState(serverConfig);
    const result = await executeProxyAction({
      action: 'list_resources',
      serverName: 'github',
      manager: { getConnection: () => undefined } as unknown as McpServerManager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('github resources (1):');
    expect(text).toContain('ui://github/dashboard');
    expect(result.details.resources).toEqual([
      {
        uri: 'ui://github/dashboard',
        name: 'Dashboard',
        description: 'Embedded GitHub dashboard',
      },
    ]);
  });

  it('hides resource inventory when resource exposure is disabled', async () => {
    const serverConfig: McpServerConfig = {
      command: 'node',
      args: ['server.js'],
      exposeResources: false,
    };
    const synced = createSyncedState(serverConfig);
    const result = await executeProxyAction({
      action: 'list_resources',
      serverName: 'github',
      manager: { getConnection: () => undefined } as unknown as McpServerManager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    expect(result.content[0]?.text).toContain('Resource exposure is disabled');
    expect(result.details.resources).toEqual([]);
  });

  it('reads a live MCP resource through the bridged proxy', async () => {
    const serverConfig: McpServerConfig = { command: 'node', args: ['server.js'] };
    const synced = createSyncedState(serverConfig);
    const manager = {
      getConnection: () => ({
        name: 'github',
        client: null,
        transport: null,
        tools: [],
        resources: [],
        status: 'connected' as const,
      }),
      readResource: vi.fn(async () => ({
        contents: [{
          uri: 'file://README.md',
          mimeType: 'text/plain',
          text: 'hello from MCP',
        }],
      })),
    } as unknown as McpServerManager;

    const result = await executeProxyAction({
      action: 'read_resource',
      serverName: 'github',
      resourceUri: 'file://README.md',
      manager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('MCP resource from github: file://README.md');
    expect(text).toContain('hello from MCP');
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
      startToolCall: startWith(callTool),
    } as unknown as McpServerManager;

    const result = await executeProxyAction({
      action: 'call_tool',
      serverName: 'github',
      toolName: 'search_docs',
      toolArguments: { query: 'auth' },
      manager,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => synced,
    });

    const text = result.content[0]?.text ?? '';
    expect(callTool).toHaveBeenCalledWith('github', 'search_docs', { query: 'auth' }, { signal: undefined });
    expect(text).toContain('MCP tool result from github.search_docs');
    expect(text).toContain('Found 2 matching docs.');
    expect(text).toContain('Structured content:');
    expect(result.details.structuredContent).toEqual({ count: 2 });
  });

  it('hands a task to the tracker and returns the task ID with the commands to follow it', async () => {
    const execution = { kind: 'task' };
    const manager = {
      getConnection: () => ({
        name: 'github', status: 'connected' as const, tools: [{ name: 'search_docs', inputSchema: { type: 'object' } }], resources: [],
      }),
      startToolCall: vi.fn(async () => ({ kind: 'task', execution })),
    } as unknown as McpServerManager;
    const adoptTask = vi.fn(async () => ({ taskId: 'task-7', serverName: 'github', toolName: 'search_docs' }) as McpTaskRecord);

    const result = await executeProxyAction({
      action: 'call_tool',
      serverName: 'github',
      toolName: 'search_docs',
      manager,
      adoptTask,
      setRuntimeStatus: () => {},
      syncSnapshot: async () => createSyncedState({ command: 'node', args: ['server.js'] }),
    });

    expect(adoptTask).toHaveBeenCalledWith(execution, { serverName: 'github', toolName: 'search_docs' });
    expect(result.details.taskId).toBe('task-7');
    expect(result.content[0]?.text).toContain('runs as task task-7');
    expect(result.content[0]?.text).toContain('sero mcp task wait task-7');
  });

  describe('a tool with an MCP app', () => {
    async function callDashboard(text: string) {
      const synced = createSyncedState({ command: 'node', args: ['server.js'] });
      const manager = {
        getConnection: () => ({
          name: 'github',
          status: 'connected' as const,
          tools: [{ name: 'open_dashboard', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: 'ui://github/dashboard' } } }],
          resources: [],
        }),
        startToolCall: startWith(vi.fn(async () => ({ content: [{ type: 'text', text }] }))),
      } as unknown as McpServerManager;
      return executeProxyAction({
        action: 'call_tool',
        serverName: 'github',
        toolName: 'open_dashboard',
        toolArguments: { repo: 'sero' },
        manager,
        setRuntimeStatus: () => {},
        syncSnapshot: async () => synced,
      });
    }

    it('names the MCP app view and keeps the input and result for it', async () => {
      const result = await callDashboard('3 open issues');

      expect(result.details.seroToolResultView).toEqual({ appId: 'mcp', contributionId: 'mcp-app' });
      expect(result.details.mcpApp).toEqual({
        serverName: 'github',
        toolName: 'open_dashboard',
        uiResourceUri: 'ui://github/dashboard',
        arguments: { repo: 'sero' },
        result: { content: [{ type: 'text', text: '3 open issues' }] },
      });
    });

    it('does not let the model call a tool that is only for the app', async () => {
      const callTool = vi.fn();
      const manager = {
        getConnection: () => ({
          name: 'github',
          status: 'connected' as const,
          tools: [{ name: 'refresh', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: 'ui://github/dashboard', visibility: ['app'] } } }],
          resources: [],
        }),
        startToolCall: startWith(callTool),
      } as unknown as McpServerManager;

      const result = await executeProxyAction({
        action: 'call_tool',
        serverName: 'github',
        toolName: 'refresh',
        manager,
        setRuntimeStatus: () => {},
        syncSnapshot: async () => createSyncedState({ command: 'node', args: ['server.js'] }),
      });

      expect(result.content[0]?.text).toContain('Error: Tool "refresh" was not found on "github".');
      expect(callTool).not.toHaveBeenCalled();
    });

    it('leaves out a result above 256 KB', async () => {
      const result = await callDashboard('x'.repeat(256 * 1024));

      expect(result.details.mcpApp).toEqual({
        serverName: 'github',
        toolName: 'open_dashboard',
        uiResourceUri: 'ui://github/dashboard',
        arguments: { repo: 'sero' },
      });
    });
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
        startToolCall: startWith(async () => {
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
