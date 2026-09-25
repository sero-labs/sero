import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncedRuntimeState } from '../runtime/runtime-types';
import { createToolResult } from '../tools/types';
import { SessionRegistry } from '../runtime/app-messages';
import { closeViewerAction, openToolUiAction, openViewerResourceAction } from '../runtime/runtime-viewer';

const readServerResourceActionMock = vi.fn();

vi.mock('../runtime/runtime-resource', () => ({
  readServerResourceAction: (options: unknown) => readServerResourceActionMock(options),
  buildResourcesDisabledMessage: (serverName: string) =>
    `Resource exposure is disabled for "${serverName}". Enable \"Expose resources\" in the MCP app to list or read resources.`,
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
    const uiServer = {
      open: vi.fn(async () => ({
        viewerId: 'session-1',
        viewerUrl: 'http://127.0.0.1:43123/?session=session-1',
        serverName: 'demo',
        resourceUri: 'ui://demo/dashboard',
      })),
    };

    const result = await openViewerResourceAction({
      cwd: '/tmp/workspace',
      serverName: 'demo',
      resourceUri: 'ui://demo/dashboard',
      manager: manager as never,
      uiResourceHandler: uiResourceHandler as never,
      uiServer: uiServer as never,
      sessions: new SessionRegistry(),
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState()),
    });

    expect(uiResourceHandler.readUiResource).toHaveBeenCalledWith('demo', 'ui://demo/dashboard');
    expect(uiServer.open).toHaveBeenCalled();
    expect(result.details.viewerUrl).toBe('http://127.0.0.1:43123/?session=session-1');
    expect(result.details.viewerId).toBe('session-1');
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
      uiServer: { open: vi.fn(), close: vi.fn() } as never,
      sessions: new SessionRegistry(),
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState()),
    });

    expect(readServerResourceActionMock).toHaveBeenCalled();
    expect(result.details.resourcePreview).toBeTruthy();
  });

  it('blocks direct ui-resource opens when resource exposure is disabled', async () => {
    const result = await openViewerResourceAction({
      cwd: '/tmp/workspace',
      serverName: 'demo',
      resourceUri: 'ui://demo/dashboard',
      manager: createManager({ status: 'connected', tools: [], resources: [] }) as never,
      uiResourceHandler: { readUiResource: vi.fn() } as never,
      uiServer: { open: vi.fn(), close: vi.fn() } as never,
      sessions: new SessionRegistry(),
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState({ exposeResources: false })),
    });

    expect(result.content[0]?.text).toContain('Resource exposure is disabled');
    expect(result.details.resourceExposureEnabled).toBe(false);
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
    const uiServer = {
      open: vi.fn(async () => ({
        viewerId: 'session-2',
        viewerUrl: 'http://127.0.0.1:43123/?session=session-2',
        serverName: 'demo',
        resourceUri: 'ui://demo/dashboard',
      })),
    };

    const result = await openToolUiAction({
      cwd: '/tmp/workspace',
      serverName: 'demo',
      toolName: 'dashboard',
      manager: manager as never,
      uiResourceHandler: uiResourceHandler as never,
      uiServer: uiServer as never,
      sessions: new SessionRegistry(),
      setRuntimeStatus: vi.fn(),
      syncSnapshot: vi.fn(async () => createSyncedState()),
    });

    expect(uiResourceHandler.readUiResource).toHaveBeenCalledWith('demo', 'ui://demo/dashboard');
    expect(result.details.toolName).toBe('dashboard');
    expect(result.details.viewerUrl).toBe('http://127.0.0.1:43123/?session=session-2');
  });

  it('closes the viewer session it names', async () => {
    const close = vi.fn(() => true);

    const result = closeViewerAction({ uiServer: { close } as never, viewerId: 'session-3' });

    expect(close).toHaveBeenCalledWith('session-3', 'closed-from-ui');
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

function createSyncedState(overrides: { exposeResources?: boolean } = {}): SyncedRuntimeState {
  return {
    configPath: '/tmp/sero/apps/mcp/config.json',
    statePath: '/tmp/sero/apps/mcp/state.json',
    rawConfigUpdatedAt: '2026-04-20T00:00:00.000Z',
    metadataCache: { version: 2, servers: {} },
    config: {
      mcpServers: {
        demo: {
          enabled: true,
          transport: 'stdio',
          lifecycle: 'lazy',
          auth: false,
          command: 'npx',
          args: ['demo'],
          exposeResources: overrides.exposeResources,
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
