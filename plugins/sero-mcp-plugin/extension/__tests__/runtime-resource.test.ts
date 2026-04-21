import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { describe, expect, it, vi } from 'vitest';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { createEmptyMetadataCache } from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import { normalizeResourcePreview, readServerResourceAction } from '../runtime/runtime-resource';
import type { SyncedRuntimeState } from '../runtime/runtime-types';

function createResult(contents: Array<Record<string, unknown>>): ReadResourceResult {
  return { contents } as unknown as ReadResourceResult;
}

function createSyncedState(config: McpConfigDocument): SyncedRuntimeState {
  return {
    configPath: '/tmp/mcp.json',
    statePath: '/tmp/mcp-state.json',
    config,
    metadataCache: createEmptyMetadataCache(),
    rawConfigUpdatedAt: null,
    snapshot: {
      initialized: true,
      firstRun: false,
      configPath: '/tmp/mcp.json',
      rawConfigUpdatedAt: null,
      servers: [
        {
          serverName: 'demo',
          enabled: true,
          transport: 'http',
          lifecycle: 'lazy',
          authMode: config.mcpServers.demo?.auth === 'oauth' ? 'oauth' : 'none',
          connectionStatus: 'connected',
          authStatus: config.mcpServers.demo?.auth === 'oauth' ? 'authenticated' : 'not-required',
          toolCount: 0,
          resourceCount: 0,
          uiToolCount: 0,
          url: config.mcpServers.demo?.url,
          exposeResources: true,
          debug: false,
          lastConnectedAt: null,
          lastFailedAt: null,
          resources: [],
          uiTools: [],
        },
      ],
      settings: { idleTimeout: 10, toolPrefix: 'server' },
      lastRefreshedAt: null,
      summary: {
        totalServers: 1,
        enabledServers: 1,
        connectedServers: 1,
        needsAuthServers: 0,
        errorServers: 0,
      },
    },
  };
}

describe('normalizeResourcePreview', () => {
  it('renders HTML resource previews from MCP UI resources', () => {
    const preview = normalizeResourcePreview('demo', 'ui://demo/app', createResult([
      {
        uri: 'ui://demo/app',
        mimeType: 'text/html;profile=mcp-app',
        text: '<html><body>Hello</body></html>',
      },
    ]));

    expect(preview.previewKind).toBe('html');
    expect(preview.html).toContain('Hello');
  });

  it('pretty-prints JSON resource previews', () => {
    const preview = normalizeResourcePreview('demo', 'file://config.json', createResult([
      {
        uri: 'file://config.json',
        mimeType: 'application/json',
        text: '{"ok":true}',
      },
    ]));

    expect(preview.previewKind).toBe('json');
    expect(preview.text).toContain('"ok": true');
  });

  it('returns data URLs for image blobs', () => {
    const preview = normalizeResourcePreview('demo', 'file://diagram.png', createResult([
      {
        uri: 'file://diagram.png',
        mimeType: 'image/png',
        blob: Buffer.from('png-data').toString('base64'),
      },
    ]));

    expect(preview.previewKind).toBe('image');
    expect(preview.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('falls back to binary preview when no text payload exists', () => {
    const preview = normalizeResourcePreview('demo', 'file://archive.bin', createResult([
      {
        uri: 'file://archive.bin',
        mimeType: 'application/octet-stream',
        blob: Buffer.from('binary').toString('base64'),
      },
    ]));

    expect(preview.previewKind).toBe('binary');
    expect(preview.text).toBeUndefined();
  });
});

describe('readServerResourceAction', () => {
  it('blocks resource reads when resource exposure is disabled', async () => {
    const config: McpConfigDocument = {
      mcpServers: {
        demo: {
          command: 'node',
          args: ['server.js'],
          exposeResources: false,
        },
      },
    };
    const synced = createSyncedState(config);
    const readResource = vi.fn();

    const result = await readServerResourceAction({
      cwd: '/tmp',
      serverName: 'demo',
      resourceUri: 'file://README.md',
      manager: {
        getConnection: vi.fn(() => undefined),
        connect: vi.fn(async () => {
          throw new Error('connect should not be called');
        }),
        readResource,
      } as unknown as McpServerManager,
      setRuntimeStatus: vi.fn(),
      syncSnapshot: async () => synced,
    });

    expect(readResource).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toContain('Resource exposure is disabled');
    expect(result.details.resourceExposureEnabled).toBe(false);
  });

  it('marks OAuth servers as needing auth again when a live resource read is unauthorized', async () => {
    const config: McpConfigDocument = {
      mcpServers: {
        demo: {
          url: 'https://example.com/mcp',
          transport: 'http',
          auth: 'oauth',
        },
      },
    };
    const synced = createSyncedState(config);
    const close = vi.fn(async () => {});
    const setRuntimeStatus = vi.fn();

    const result = await readServerResourceAction({
      cwd: '/tmp',
      serverName: 'demo',
      resourceUri: 'ui://demo/app',
      manager: {
        getConnection: () => ({
          name: 'demo',
          client: null,
          transport: null,
          tools: [],
          resources: [],
          status: 'connected' as const,
        }),
        readResource: vi.fn(async () => {
          throw new UnauthorizedError('Expired token');
        }),
        close,
      } as unknown as McpServerManager,
      setRuntimeStatus,
      syncSnapshot: async () => synced,
    });

    expect(close).toHaveBeenCalledWith('demo');
    expect(setRuntimeStatus).toHaveBeenCalledWith('demo', expect.objectContaining({
      connectionStatus: 'needs-auth',
      authStatus: 'not-authenticated',
      lastError: 'Expired token',
    }));
    expect(result.content[0]?.text).toContain('requires in-app authentication');
    expect(result.details.authRequired).toBe(true);
  });
});
