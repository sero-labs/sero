/**
 * Runtime-to-UI events reach only the app that subscribed to them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { AppRuntimeEvent } from '@/types/ipc';

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  webContents: { id: number; send: ReturnType<typeof vi.fn> };
  isDestroyed: () => boolean;
}

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  windows: [] as FakeWindow[],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      mocks.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => mocks.windows,
  },
}));

/** Reloaded per test so each window’s destruction handler binds exactly once. */
let emitAppRuntimeEvent: (appId: string, workspaceId: string, topic: string, payload: unknown) => void;
let registerAppRuntimeEventHandlers: () => void;

function makeWindow(id: number): FakeWindow {
  return {
    webContents: { id, send: vi.fn() },
    isDestroyed: () => false,
  };
}

function makeSender(id: number) {
  return { id, once: vi.fn(), on: vi.fn() };
}

function handler(channel: string): IpcHandler {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`No handler registered for ${channel}`);
  return found;
}

/** App-runtime events sent to one window. */
function eventsFor(index: number): AppRuntimeEvent[] {
  return mocks.windows[index].webContents.send.mock.calls
    .filter((call) => call[0] === IpcChannels.appRuntime.event)
    .map((call) => call[1] as AppRuntimeEvent);
}

async function subscribe(windowIndex: number, appId: string, workspaceId: string, topic: string) {
  await handler(IpcChannels.appRuntime.subscribe)(
    { sender: makeSender(mocks.windows[windowIndex].webContents.id) },
    appId,
    workspaceId,
    topic,
  );
}

beforeEach(async () => {
  vi.resetModules();
  mocks.handlers.clear();
  mocks.windows = [makeWindow(1), makeWindow(2)];
  ({ emitAppRuntimeEvent, registerAppRuntimeEventHandlers } = await import(
    '@electron/ipc/apps/app-runtime-events'
  ));
  registerAppRuntimeEventHandlers();
});

describe('app runtime UI events', () => {
  it('does not send an event to another app', async () => {
    await subscribe(0, 'app-a', 'ws-1', 'members');
    await subscribe(1, 'app-b', 'ws-1', 'members');

    emitAppRuntimeEvent('app-a', 'ws-1', 'members', { text: 'hello' });

    expect(eventsFor(0)).toHaveLength(1);
    expect(eventsFor(0)[0].payload).toEqual({ text: 'hello' });
    expect(eventsFor(1)).toHaveLength(0);
  });

  it('scopes delivery by workspace and topic', async () => {
    await subscribe(0, 'app-a', 'ws-1', 'members');

    emitAppRuntimeEvent('app-a', 'ws-2', 'members', { text: 'other workspace' });
    emitAppRuntimeEvent('app-a', 'ws-1', 'other-topic', { text: 'other topic' });

    expect(eventsFor(0)).toHaveLength(0);
  });

  it('keeps delivering while any other view still holds the same topic', async () => {
    // A Workflow page's top bar and its Refine plan both follow the running
    // call. The first of them to unmount must not stop the other's delivery.
    await subscribe(0, 'app-a', 'ws-1', 'call');
    await subscribe(0, 'app-a', 'ws-1', 'call');
    await handler(IpcChannels.appRuntime.unsubscribe)({ sender: makeSender(1) }, 'app-a', 'ws-1', 'call');

    emitAppRuntimeEvent('app-a', 'ws-1', 'call', { runId: 'run-1' });
    expect(eventsFor(0)).toHaveLength(1);

    // The last holder releasing does stop it.
    await handler(IpcChannels.appRuntime.unsubscribe)({ sender: makeSender(1) }, 'app-a', 'ws-1', 'call');
    emitAppRuntimeEvent('app-a', 'ws-1', 'call', { runId: 'run-2' });
    expect(eventsFor(0)).toHaveLength(1);
  });

  it('stops delivery after unsubscribe', async () => {
    await subscribe(0, 'app-a', 'ws-1', 'members');
    await handler(IpcChannels.appRuntime.unsubscribe)(
      { sender: makeSender(1) },
      'app-a',
      'ws-1',
      'members',
    );

    emitAppRuntimeEvent('app-a', 'ws-1', 'members', { text: 'after' });

    expect(eventsFor(0)).toHaveLength(0);
  });

  it('drops a window’s subscriptions when the window is destroyed', async () => {
    const sender = makeSender(1);
    await handler(IpcChannels.appRuntime.subscribe)({ sender }, 'app-a', 'ws-1', 'members');

    const onDestroyed = sender.once.mock.calls.find((call) => call[0] === 'destroyed')?.[1] as
      | (() => void)
      | undefined;
    expect(onDestroyed).toBeTypeOf('function');

    onDestroyed!();
    emitAppRuntimeEvent('app-a', 'ws-1', 'members', { text: 'after' });

    expect(eventsFor(0)).toHaveLength(0);
  });
});
