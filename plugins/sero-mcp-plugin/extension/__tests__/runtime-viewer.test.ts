import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncedRuntimeState } from '../runtime/runtime-types';
import { createToolResult } from '../tools/types';
import { closeViewerAction, openToolUiAction, openViewerResourceAction } from '../runtime/runtime-viewer';

const readServerResourceActionMock = vi.fn();

vi.mock('../runtime/runtime-resource', () => ({
  readServerResourceAction: (options: unknown) => readServerResourceActionMock(options),
}));

describe('runtime-viewer', () => {
  beforeEach(() => {
    readServerResourceActionMock.mockReset();
  });

  it('opens a loopback viewer session for ui resources', async () => {
    const manager = createManager({
      status: 'connected',
      tools: [],
      resources: [{ uri: 'ui://demo/dashboard', name: 'Dashboard', _meta: {} }],
    });
    const uiResourceHandler = {
      readUiResource: vi.fn(async () => ({
        uri: 'ui://demo/dashboard',
        html: '<html><body>demo</body></html>',
        mimeType: 'text/html;profile=mcp-app',
        meta: {},
      })),
    };
    const uiSessions = {
      open: vi.fn(async () => ({
        sessionId: 'session-1',
        viewerUrl: 'http://127.0.0.1:43123/?session=session-1',
        serverName: 'demo',
        resourceUri: 'ui://demo/dashboard',
        close: vi.fn(),
      })),
    };

    const result = await openViewerResourceAction({
      cwd: '/tmp/workspace',
      serverName: 'demo',
      resourceUri: 'ui://demo/dashboard',
      manager: manager as never,
      uiResourceHandler: uiResourceHandler as never,
      uiSessions: uiSessions as never,
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState()),
    });

    expect(uiResourceHandler.readUiResource).toHaveBeenCalledWith('demo', 'ui://demo/dashboard');
    expect(uiSessions.open).toHaveBeenCalled();
    expect(result.details.viewerUrl).toBe('http://127.0.0.1:43123/?session=session-1');
    expect(result.details.sessionId).toBe('session-1');
  });

  it('falls back to inline preview handling for non-ui resources', async () => {
    readServerResourceActionMock.mockResolvedValue(createToolResult('Loaded resource.', {
      resourcePreview: {
        serverName: 'demo',
        requestedUri: 'file://README.md',
        resolvedUri: 'file://README.md',
        previewKind: 'text',
        text: 'hello',
        truncated: false,
      },
    }));

    const result = await openViewerResourceAction({
      cwd: '/tmp/workspace',
      serverName: 'demo',
      resourceUri: 'file://README.md',
      manager: createManager({ status: 'connected', tools: [], resources: [] }) as never,
      uiResourceHandler: { readUiResource: vi.fn() } as never,
      uiSessions: { open: vi.fn(), getActiveSession: vi.fn(), closeActive: vi.fn(async () => undefined) } as never,
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState()),
    });

    expect(readServerResourceActionMock).toHaveBeenCalled();
    expect(result.details.resourcePreview).toBeTruthy();
  });

  it('opens tool UIs using metadata-derived ui resource URIs', async () => {
    const manager = createManager({
      status: 'connected',
      tools: [
        {
          name: 'dashboard',
          description: 'Open the dashboard',
          inputSchema: { type: 'object', properties: {} },
          _meta: { ui: { resourceUri: 'ui://demo/dashboard' } },
        },
      ],
      resources: [],
    });
    const uiResourceHandler = {
      readUiResource: vi.fn(async () => ({
        uri: 'ui://demo/dashboard',
        html: '<html><body>tool ui</body></html>',
        mimeType: 'text/html;profile=mcp-app',
        meta: {},
      })),
    };
    const uiSessions = {
      open: vi.fn(async () => ({
        sessionId: 'session-2',
        viewerUrl: 'http://127.0.0.1:43123/?session=session-2',
        serverName: 'demo',
        resourceUri: 'ui://demo/dashboard',
        close: vi.fn(),
      })),
    };

    const result = await openToolUiAction({
      cwd: '/tmp/workspace',
      serverName: 'demo',
      toolName: 'dashboard',
      manager: manager as never,
      uiResourceHandler: uiResourceHandler as never,
      uiSessions: uiSessions as never,
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState()),
    });

    expect(uiResourceHandler.readUiResource).toHaveBeenCalledWith('demo', 'ui://demo/dashboard');
    expect(result.details.toolName).toBe('dashboard');
    expect(result.details.viewerUrl).toBe('http://127.0.0.1:43123/?session=session-2');
  });

  it('closes the active viewer session', async () => {
    const closeActive = vi.fn(async () => undefined);

    const result = await closeViewerAction({
      uiSessions: {
        getActiveSession: () => ({
          sessionId: 'session-3',
          viewerUrl: 'http://127.0.0.1:43123/?session=session-3',
          serverName: 'demo',
          resourceUri: 'ui://demo/dashboard',
          close: vi.fn(),
        }),
        closeActive,
      } as never,
    });

    expect(closeActive).toHaveBeenCalledWith('closed-from-ui');
    expect(result.details.sessionClosed).toBe(true);
  });
});

function createManager({
  status,
  tools,
  resources,
}: {
  status: 'connected' | 'needs-auth' | 'error';
  tools: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
}) {
  return {
    getConnection: vi.fn(() => ({
      name: 'demo',
      client: null,
      transport: null,
      status,
      tools,
      resources,
      lastConnectedAt: null,
      lastFailedAt: null,
    })),
    connect: vi.fn(async () => ({
      name: 'demo',
      client: null,
      transport: null,
      status,
      tools,
      resources,
      lastConnectedAt: null,
      lastFailedAt: null,
    })),
    close: vi.fn(async () => undefined),
    callTool: vi.fn(async () => ({ isError: false, content: [{ type: 'text', text: 'ok' }] })),
    readResource: vi.fn(async () => ({ contents: [] })),
  };
}

function createSyncedState(): SyncedRuntimeState {
  return {
    configPath: '/tmp/sero/apps/mcp/config.json',
    statePath: '/tmp/sero/apps/mcp/state.json',
    rawConfigUpdatedAt: '2026-04-20T00:00:00.000Z',
    metadataCache: { version: 1, servers: {} },
    config: {
      mcpServers: {
        demo: {
          enabled: true,
          transport: 'stdio',
          lifecycle: 'lazy',
          auth: false,
          command: 'npx',
          args: ['demo'],
        },
      },
    },
    snapshot: {
      initialized: true,
      firstRun: false,
      configPath: '/tmp/sero/apps/mcp/config.json',
      rawConfigUpdatedAt: '2026-04-20T00:00:00.000Z',
      servers: [],
      settings: { idleTimeout: 10, toolPrefix: 'server' },
      lastRefreshedAt: '2026-04-20T00:00:00.000Z',
      summary: {
        totalServers: 1,
        enabledServers: 1,
        connectedServers: 1,
        needsAuthServers: 0,
        errorServers: 0,
      },
    },
  } as unknown as SyncedRuntimeState;
}
