import { describe, expect, it, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';

// The handlers read real state files. The manager is replaced so the
// tests never touch a profile directory.
const readWithEtag = vi.fn(async (_filePath: string) => ({ data: { done: 2 }, etag: 'etag-1' }));
const watch = vi.fn((_filePath: string) => {});
const unwatch = vi.fn((_filePath: string) => {});
vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: {
    readWithEtag: (filePath: string) => readWithEtag(filePath),
    watch: (filePath: string) => watch(filePath),
    unwatch: (filePath: string) => unwatch(filePath),
    onFileChange: () => {},
  },
}));

import {
  routeWidgetRequest,
  setAssetTicketIssuer,
} from '@electron/features/gateway/server/widget-handlers';
import {
  registerRemoteWidgets,
  resetRemoteWidgets,
} from '@electron/features/gateway/server/remote-widgets';
import { resetWidgetStateBridge } from '@electron/features/gateway/bridge/widget-state-bridge';
import type { GatewayAccessScope } from '@electron/features/gateway/server/access-control';
import type { GatewayAgentOps } from '@electron/features/gateway/server/types';
import type { GatewayRequest } from '@electron/features/gateway/server/protocol';
import type { SeroAppManifest } from '@/types/sero-apps';

interface SentResponse {
  type: string;
  requestType?: string;
  data?: unknown;
  message?: string;
}

function fakeSocket(): { ws: WebSocket; sent: SentResponse[] } {
  const sent: SentResponse[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as SentResponse),
  } as unknown as WebSocket;
  return { ws, sent };
}

function scope(workspaceIds: string[] | null): GatewayAccessScope {
  return {
    authorizedWorkspaceIds: workspaceIds === null ? null : new Set(workspaceIds),
    authorizedSessions: new Map(),
    authorizedArtifacts: new Map(),
  };
}

const ops = {
  listWorkspaces: async () => [
    { id: 'ws-1', name: 'One', path: '/work/one' },
    { id: 'ws-2', name: 'Two', path: '/work/two' },
  ],
} as unknown as GatewayAgentOps;

function registerTodo(): void {
  registerRemoteWidgets({
    id: 'todo',
    name: 'Todo',
    scope: 'workspace',
    stateFile: '.sero/state.json',
    globalStatePath: '/profile/todo.json',
    uiEntry: 'dist/ui/remoteEntry.js',
    component: 'App',
    packagePath: '/plugins/todo',
    contributions: {
      components: [
        {
          extensionPoint: 'ui.dashboard.widget',
          id: 'summary',
          name: 'Summary',
          component: 'Summary',
          defaultSize: { w: 4, h: 3 },
          remote: true,
        },
      ],
    },
  } as unknown as SeroAppManifest);
}

afterEach(() => {
  resetRemoteWidgets();
  resetWidgetStateBridge();
  readWithEtag.mockClear();
  watch.mockClear();
  unwatch.mockClear();
});

describe('list_remote_widgets', () => {
  it('lists the widgets for an authorized workspace', async () => {
    setAssetTicketIssuer((appId) => `ticket-${appId}`);
    registerTodo();
    const { ws, sent } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'list_remote_widgets', workspaceId: 'ws-1' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0].type).toBe('ok');
    expect(sent[0].data).toMatchObject([{ appId: 'todo', stateKey: 'todo@ws-1' }]);
  });

  it('refuses a workspace this token cannot reach', async () => {
    registerTodo();
    const { ws, sent } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'list_remote_widgets', workspaceId: 'ws-2' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]).toMatchObject({ type: 'error', message: 'Workspace not authorized: ws-2' });
  });
});

describe('app state over the gateway', () => {
  it('reads the file a key names', async () => {
    registerTodo();
    const { ws, sent } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'app_state_get', key: 'todo@ws-1' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(readWithEtag).toHaveBeenCalledWith('/work/one/.sero/state.json');
    expect(sent[0].data).toEqual({ key: 'todo@ws-1', data: { done: 2 }, etag: 'etag-1' });
  });

  it('refuses a key naming a workspace this token cannot reach', async () => {
    registerTodo();
    const { ws, sent } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'app_state_get', key: 'todo@ws-2' } as GatewayRequest,
      scope(['ws-1']),
    );

    expect(sent[0]).toMatchObject({ type: 'error', message: 'Unknown widget state: todo@ws-2' });
    expect(readWithEtag).not.toHaveBeenCalled();
  });

  it('refuses a key naming an app with no remote widget', async () => {
    const { ws, sent } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'app_state_get', key: 'secrets@ws-1' } as GatewayRequest,
      scope(null),
    );

    expect(sent[0].type).toBe('error');
    expect(readWithEtag).not.toHaveBeenCalled();
  });

  it('starts a watch and answers with the current state', async () => {
    registerTodo();
    const { ws, sent } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'app_state_watch', key: 'todo@ws-1' } as GatewayRequest,
      scope(null),
    );

    expect(watch).toHaveBeenCalledWith('/work/one/.sero/state.json');
    expect(sent[0].data).toMatchObject({ key: 'todo@ws-1', etag: 'etag-1' });
  });

  it('watches a file once per socket, however often it is asked', async () => {
    registerTodo();
    const { ws } = fakeSocket();
    const request = { type: 'app_state_watch', key: 'todo@ws-1' } as GatewayRequest;

    await routeWidgetRequest(ws, ops, request, scope(null));
    await routeWidgetRequest(ws, ops, request, scope(null));

    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('stops the watch it started', async () => {
    registerTodo();
    const { ws } = fakeSocket();

    await routeWidgetRequest(
      ws,
      ops,
      { type: 'app_state_watch', key: 'todo@ws-1' } as GatewayRequest,
      scope(null),
    );
    await routeWidgetRequest(
      ws,
      ops,
      { type: 'app_state_unwatch', key: 'todo@ws-1' } as GatewayRequest,
      scope(null),
    );

    expect(unwatch).toHaveBeenCalledWith('/work/one/.sero/state.json');
  });

  it('leaves other request types to the rest of the chain', async () => {
    const { ws, sent } = fakeSocket();

    const handled = await routeWidgetRequest(
      ws,
      ops,
      { type: 'git_status', workspaceId: 'ws-1' } as GatewayRequest,
      scope(null),
    );

    expect(handled).toBe(false);
    expect(sent).toEqual([]);
  });
});
