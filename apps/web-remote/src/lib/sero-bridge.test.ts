import { describe, expect, it, beforeEach, vi } from 'vitest';
import { dispatchAppStateChange, installRemoteSeroBridge } from './sero-bridge';
import type { GatewayMessage } from './gateway-client';
import type { RemoteStateClient } from './sero-bridge';

interface AppStateBridge {
  read: (key: string) => Promise<unknown>;
  write: (key: string, data: unknown, expectedEtag?: string | null) => Promise<unknown>;
  watch: (key: string) => Promise<{ data: unknown; etag: string | null }>;
  unwatch: (key: string) => Promise<void>;
  onChange: (
    handler: (key: string, data: unknown, etag: string | null) => void,
  ) => () => void;
}

function bridge(): AppStateBridge {
  return (window as unknown as { sero: { appState: AppStateBridge } }).sero.appState;
}

const appStateSet = vi.fn(async () => ({ key: 'todo@ws-1', ok: true, etag: 'e9' }));

const client = {
  appStateSet,
  appStateGet: vi.fn(async () => ({ data: { done: 1 }, etag: 'e1' })),
  appStateWatch: vi.fn(async () => ({ data: { done: 2 }, etag: 'e2' })),
  appStateUnwatch: vi.fn(async () => undefined),
} as unknown as RemoteStateClient;

beforeEach(() => {
  installRemoteSeroBridge(client);
});

describe('the remote window.sero', () => {
  it('reads state by key, and hands back only the data', async () => {
    await expect(bridge().read('todo@ws-1')).resolves.toEqual({ done: 1 });
  });

  it('watches state by key, and hands back the etag with it', async () => {
    await expect(bridge().watch('todo@ws-1')).resolves.toEqual({
      data: { done: 2 },
      etag: 'e2',
    });
  });

  it('writes state with the etag the widget is based on', async () => {
    await expect(bridge().write('todo@ws-1', { done: 3 }, 'e1')).resolves.toEqual({
      ok: true,
      etag: 'e9',
    });
    expect(appStateSet).toHaveBeenCalledWith('todo@ws-1', { done: 3 }, 'e1');
  });

  it('hands back the newer content when the host refuses the write', async () => {
    appStateSet.mockResolvedValueOnce({
      key: 'todo@ws-1',
      ok: false,
      data: { done: 7 },
      etag: 'e8',
    } as unknown as { key: string; ok: true; etag: string });

    await expect(bridge().write('todo@ws-1', { done: 3 }, 'e1')).resolves.toEqual({
      ok: false,
      data: { done: 7 },
      etag: 'e8',
    });
  });
});

describe('app_state_changed', () => {
  it('reaches every listener', () => {
    const heard: Array<[string, unknown, string | null]> = [];
    bridge().onChange((key, data, etag) => heard.push([key, data, etag]));

    dispatchAppStateChange({
      type: 'app_state_changed',
      key: 'todo@ws-1',
      data: { done: 4 },
      etag: 'e3',
    } as unknown as GatewayMessage);

    expect(heard).toEqual([['todo@ws-1', { done: 4 }, 'e3']]);
  });

  it('stops reaching a listener that unsubscribed', () => {
    const heard: string[] = [];
    const stop = bridge().onChange((key) => heard.push(key));
    stop();

    dispatchAppStateChange({
      type: 'app_state_changed',
      key: 'todo@ws-1',
      data: {},
      etag: null,
    } as unknown as GatewayMessage);

    expect(heard).toEqual([]);
  });

  it('ignores any other message', () => {
    const heard: string[] = [];
    bridge().onChange((key) => heard.push(key));

    dispatchAppStateChange({ type: 'turn_complete' } as unknown as GatewayMessage);

    expect(heard).toEqual([]);
  });
});
