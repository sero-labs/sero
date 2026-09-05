import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { WorkspaceChangeEvent } from '@electron/features/workspace/watcher';

/** The listeners the bridges install, captured so a test can fire them. */
let stateChanged: ((filePath: string, data: unknown, etag: string | null) => void) | null = null;
let treeChanged: ((event: WorkspaceChangeEvent) => void) | null = null;

vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: {
    readWithEtag: async () => ({ data: null, etag: null }),
    watch: () => {},
    unwatch: () => {},
    onFileChange: (listener: (filePath: string, data: unknown, etag: string | null) => void) => {
      stateChanged = listener;
    },
  },
}));

vi.mock('@electron/features/workspace/watcher', () => ({
  fileWatcherManager: {
    watch: () => {},
    unwatch: () => {},
    onChange: (listener: (event: WorkspaceChangeEvent) => void) => {
      treeChanged = listener;
      return () => {
        treeChanged = null;
      };
    },
  },
}));

vi.mock('@electron/features/workspace/watch-roots', () => ({
  workspaceWatchRoots: async () => [{ hostDir: '/work/a', virtualRoot: '/workspace' }],
}));

import { applyAuthResult } from '@electron/features/gateway/server/client-registry';
import { resetWidgetStateBridge, watchWidgetState } from '@electron/features/gateway/bridge/widget-state-bridge';
import { resetFileTreeBridge, watchFileTree } from '@electron/features/gateway/bridge/file-tree-bridge';
import type { ConnectedClient } from '@electron/features/gateway';

function fakeClient(): { client: ConnectedClient; sent: Array<Record<string, unknown>> } {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as Record<string, unknown>),
  } as unknown as WebSocket;
  const client: ConnectedClient = {
    ws,
    clientType: 'web',
    clientId: 'c1',
    authenticated: true,
    isMasterAuth: false,
    tokenId: 'tok-a',
    authorizedWorkspaceIds: new Set(['ws-a']),
    authorizedSessions: new Map(),
    authorizedArtifacts: new Map(),
    subscribedSessions: new Set(),
    remoteIp: '127.0.0.1',
    lastActivity: Date.now(),
  };
  return { client, sent };
}

afterEach(() => {
  resetWidgetStateBridge();
  resetFileTreeBridge();
});

describe('authenticating again', () => {
  it('drops the widget and file-tree watches the old scope granted', async () => {
    const { client, sent } = fakeClient();
    await watchWidgetState(client.ws, 'todo@ws-a', '/work/a/state.json');
    await watchFileTree(client.ws, 'ws-a');

    applyAuthResult(client, { type: 'web', authorizedWorkspaceIds: ['ws-b'], tokenId: 'tok-b' });

    stateChanged?.('/work/a/state.json', { done: 1 }, 'etag-1');
    treeChanged?.({ workspaceId: 'ws-a', directories: ['/workspace/src'] });

    expect(sent).toEqual([]);
    expect(client.tokenId).toBe('tok-b');
    expect([...client.authorizedWorkspaceIds ?? []]).toEqual(['ws-b']);
  });
});
