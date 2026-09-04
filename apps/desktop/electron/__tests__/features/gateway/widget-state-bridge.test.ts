import { describe, expect, it, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';

/** The listener the bridge installs, captured so a test can fire it. */
let fileChanged: ((filePath: string, data: unknown) => void) | null = null;
const watch = vi.fn();
const unwatch = vi.fn();

vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: {
    readWithEtag: async () => ({ data: { done: 3 }, etag: 'etag-2' }),
    watch: (filePath: string) => watch(filePath),
    unwatch: (filePath: string) => unwatch(filePath),
    onFileChange: (listener: (filePath: string, data: unknown) => void) => {
      fileChanged = listener;
    },
  },
}));

import {
  dropWidgetStateWatches,
  resetWidgetStateBridge,
  unwatchWidgetState,
  watchWidgetState,
} from '@electron/features/gateway/bridge/widget-state-bridge';

function fakeSocket(): { ws: WebSocket; sent: Array<Record<string, unknown>> } {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as Record<string, unknown>),
  } as unknown as WebSocket;
  return { ws, sent };
}

/** Fire a file change and let the bridge's read settle. */
async function emitChange(filePath: string): Promise<void> {
  fileChanged?.(filePath, { done: 3 });
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  resetWidgetStateBridge();
  watch.mockClear();
  unwatch.mockClear();
});

describe('widget state bridge', () => {
  it('pushes a change to the socket that watched the file', async () => {
    const { ws, sent } = fakeSocket();
    await watchWidgetState(ws, 'todo@ws-1', '/work/one/state.json');

    await emitChange('/work/one/state.json');

    expect(sent).toEqual([
      { type: 'app_state_changed', key: 'todo@ws-1', data: { done: 3 }, etag: 'etag-2' },
    ]);
  });

  it('sends nothing to a socket that watched another file', async () => {
    const watcher = fakeSocket();
    const other = fakeSocket();
    await watchWidgetState(watcher.ws, 'todo@ws-1', '/work/one/state.json');
    await watchWidgetState(other.ws, 'todo@ws-2', '/work/two/state.json');

    await emitChange('/work/one/state.json');

    expect(watcher.sent).toHaveLength(1);
    expect(other.sent).toEqual([]);
  });

  it('sends nothing after the watch is dropped', async () => {
    const { ws, sent } = fakeSocket();
    await watchWidgetState(ws, 'todo@ws-1', '/work/one/state.json');

    unwatchWidgetState(ws, '/work/one/state.json');
    await emitChange('/work/one/state.json');

    expect(sent).toEqual([]);
    expect(unwatch).toHaveBeenCalledWith('/work/one/state.json');
  });

  it('drops every watch a disconnecting socket held', async () => {
    const { ws, sent } = fakeSocket();
    await watchWidgetState(ws, 'todo@ws-1', '/work/one/state.json');
    await watchWidgetState(ws, 'notes', '/profile/notes.json');

    dropWidgetStateWatches(ws);
    await emitChange('/work/one/state.json');
    await emitChange('/profile/notes.json');

    expect(sent).toEqual([]);
    expect(unwatch).toHaveBeenCalledTimes(2);
  });

  it('sends nothing to a socket that already closed', async () => {
    const sent: string[] = [];
    const ws = {
      readyState: WebSocket.CLOSED,
      send: (payload: string) => sent.push(payload),
    } as unknown as WebSocket;
    await watchWidgetState(ws, 'todo@ws-1', '/work/one/state.json');

    await emitChange('/work/one/state.json');

    expect(sent).toEqual([]);
  });
});
