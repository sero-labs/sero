import { describe, expect, it, vi } from 'vitest';
import type { McpConfigDocument } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import { connectServerAction } from '../runtime/runtime-actions';
import type { SyncedRuntimeState } from '../runtime/runtime-types';

const { readMetadataCacheMock, reconcileConnectionMock } = vi.hoisted(() => ({
  readMetadataCacheMock: vi.fn(),
  reconcileConnectionMock: vi.fn(),
}));

vi.mock('../cache/metadata-cache', () => ({
  readMetadataCache: readMetadataCacheMock,
}));

vi.mock('../runtime/runtime-connect', async () => {
  const actual = await vi.importActual<typeof import('../runtime/runtime-connect')>('../runtime/runtime-connect');
  return {
    ...actual,
    reconcileConnection: reconcileConnectionMock,
  };
});

function createSyncedState(
  config: McpConfigDocument,
  connectionStatus: 'idle' | 'connected',
): SyncedRuntimeState {
  return {
    configPath: '/tmp/mcp.json',
    statePath: '/tmp/mcp-state.json',
    config,
    metadataCache: { version: 1, servers: {} },
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
          transport: 'http',
          lifecycle: 'lazy',
          authMode: 'none',
          connectionStatus,
          authStatus: 'not-required',
          toolCount: connectionStatus === 'connected' ? 2 : 0,
          resourceCount: 0,
          uiToolCount: 0,
          url: 'https://example.com/mcp',
          exposeResources: true,
          debug: false,
          lastConnectedAt: connectionStatus === 'connected' ? '2026-04-21T00:00:00.000Z' : null,
          lastFailedAt: null,
          resources: [],
          uiTools: [],
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
        connectedServers: connectionStatus === 'connected' ? 1 : 0,
        needsAuthServers: 0,
        errorServers: 0,
      },
    },
  };
}

describe('connectServerAction', () => {
  it('returns an explicit no-op message when the server is already connected', async () => {
    readMetadataCacheMock.mockReset();
    reconcileConnectionMock.mockReset();

    const config: McpConfigDocument = {
      mcpServers: {
        github: {
          transport: 'http',
          url: 'https://example.com/mcp',
          enabled: true,
        },
      },
    };

    readMetadataCacheMock.mockResolvedValue({ version: 1, servers: {} });
    reconcileConnectionMock.mockResolvedValue({
      nextCache: { version: 1, servers: {} },
      runtimeStatus: {
        connectionStatus: 'connected',
        authStatus: 'not-required',
        lastConnectedAt: '2026-04-21T00:00:00.000Z',
        lastFailedAt: null,
      },
    });

    const syncSnapshot = vi
      .fn<(...args: unknown[]) => Promise<SyncedRuntimeState>>()
      .mockResolvedValueOnce(createSyncedState(config, 'idle'))
      .mockResolvedValueOnce(createSyncedState(config, 'connected'));
    const connect = vi.fn(async () => {
      throw new Error('connect should not be called when an active connection already exists');
    });
    const manager = {
      getConnection: vi.fn(() => ({
        name: 'github',
        client: null,
        transport: null,
        tools: [{ name: 'search_docs', inputSchema: { type: 'object' } }],
        resources: [],
        status: 'connected' as const,
        lastConnectedAt: '2026-04-21T00:00:00.000Z',
        lastFailedAt: null,
      })),
      connect,
      reconnect: vi.fn(),
    } as unknown as McpServerManager;
    const setRuntimeStatus = vi.fn();

    const result = await connectServerAction({
      cwd: '/tmp',
      serverName: 'github',
      reconnect: false,
      manager,
      setRuntimeStatus,
      syncSnapshot,
    });

    expect(connect).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toBe('MCP server "github" is already connected.');
    expect(result.details.alreadyConnected).toBe(true);
    expect(setRuntimeStatus).toHaveBeenCalledWith('github', expect.objectContaining({
      connectionStatus: 'connected',
      authStatus: 'not-required',
    }));
  });
});
