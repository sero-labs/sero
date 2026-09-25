import { describe, expect, it, vi } from 'vitest';
import { createEmptyMetadataCache } from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import type { McpOAuthCoordinator } from '../auth/oauth-coordinator';
import { clearServerAuthAction } from '../runtime/runtime-auth';
import type { SyncedRuntimeState } from '../runtime/runtime-types';

const { clearOAuthCredentialsMock } = vi.hoisted(() => ({
  clearOAuthCredentialsMock: vi.fn(),
}));

vi.mock('../auth/storage', () => ({
  clearOAuthCredentials: clearOAuthCredentialsMock,
}));

function createSyncedState(config: McpConfigDocument, authStatus: 'authenticated' | 'not-authenticated'): SyncedRuntimeState {
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
          serverName: 'github',
          enabled: true,
          transport: 'http',
          lifecycle: 'lazy',
          authMode: 'oauth',
          connectionStatus: authStatus === 'authenticated' ? 'connected' : 'needs-auth',
          authStatus,
          toolCount: 0,
          resourceCount: 0,
          uiToolCount: 0,
          url: 'https://example.com/mcp',
          exposeResources: true,
          debug: false,
          lastConnectedAt: null,
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
        connectedServers: authStatus === 'authenticated' ? 1 : 0,
        needsAuthServers: authStatus === 'authenticated' ? 0 : 1,
        errorServers: 0,
      },
    },
  };
}

describe('clearServerAuthAction', () => {
  it('clears saved OAuth credentials and resets the server auth state', async () => {
    clearOAuthCredentialsMock.mockReset();
    const config: McpConfigDocument = {
      mcpServers: {
        github: {
          url: 'https://example.com/mcp',
          transport: 'http',
          auth: 'oauth',
        },
      },
    };
    const syncSnapshot = vi
      .fn<() => Promise<SyncedRuntimeState>>()
      .mockResolvedValueOnce(createSyncedState(config, 'authenticated'))
      .mockResolvedValueOnce(createSyncedState(config, 'not-authenticated'));
    const cancelAuth = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const setRuntimeStatus = vi.fn();

    const result = await clearServerAuthAction({
      cwd: '/tmp',
      serverName: 'github',
      authCoordinator: { cancelAuth } as unknown as McpOAuthCoordinator,
      manager: { close } as unknown as McpServerManager,
      setRuntimeStatus,
      syncSnapshot,
    });

    expect(cancelAuth).toHaveBeenCalledWith('github');
    expect(close).toHaveBeenCalledWith('github');
    expect(clearOAuthCredentialsMock).toHaveBeenCalledWith('github');
    expect(setRuntimeStatus).toHaveBeenCalledWith('github', { authStatus: 'not-authenticated' });
    expect(result.details.authStatus).toBe('not-authenticated');
  });

  it('removes the signed-out server private cache entry', async () => {
    const config: McpConfigDocument = {
      mcpServers: { github: { url: 'https://example.com/mcp', transport: 'http', auth: 'oauth' } },
    };
    const entry = { cachedAt: 1, configHash: 'hash', toolCount: 0, resourceCount: 0, tools: [], resources: [] };
    const signedIn = createSyncedState(config, 'authenticated');
    signedIn.metadataCache = { version: 2, servers: { github: { ...entry, cacheScope: 'private' }, docs: { ...entry, cacheScope: 'public' } } };
    const syncSnapshot = vi.fn<(cwd?: string, options?: { metadataCache?: SyncedRuntimeState['metadataCache'] }) => Promise<SyncedRuntimeState>>()
      .mockResolvedValueOnce(signedIn)
      .mockResolvedValueOnce(createSyncedState(config, 'not-authenticated'));

    await clearServerAuthAction({
      cwd: '/tmp',
      serverName: 'github',
      authCoordinator: { cancelAuth: vi.fn(async () => {}) } as unknown as McpOAuthCoordinator,
      manager: { close: vi.fn(async () => {}) } as unknown as McpServerManager,
      setRuntimeStatus: vi.fn(),
      syncSnapshot,
    });

    expect(Object.keys(syncSnapshot.mock.calls[1]?.[1]?.metadataCache?.servers ?? {})).toEqual(['docs']);
  });
});
