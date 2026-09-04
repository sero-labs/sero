/**
 * The remote half of `window.sero`.
 *
 * A federated widget calls `useAppState`, which expects the desktop
 * preload bridge. In a browser there is no preload and no file system,
 * so this shim answers the same calls over the gateway.
 *
 * What the desktop calls a state file path is an opaque key here. The
 * host maps the key back to a file; the browser never learns the path.
 *
 * Phase 1 is read-only. `write` and `prompt` reject with a message the
 * widget can show. Writing arrives with issue #497.
 */

import type { GatewayClient, GatewayMessage } from './gateway-client';

/** What the host answers a read or a watch with. */
interface AppStateReadResult<T> {
  data: T;
  etag: string | null;
}

type ChangeHandler = (key: string, data: unknown, etag: string | null) => void;

const changeHandlers = new Set<ChangeHandler>();

/** The message a write attempt fails with, until #497 lands. */
export const READ_ONLY_MESSAGE = 'This widget is read-only in a browser.';

/** Hand an `app_state_changed` event to every watching widget. */
export function dispatchAppStateChange(msg: GatewayMessage): void {
  if (msg.type !== 'app_state_changed') return;
  const event = msg as unknown as { key?: unknown; data?: unknown; etag?: unknown };
  if (typeof event.key !== 'string') return;

  const etag = typeof event.etag === 'string' ? event.etag : null;
  for (const handler of changeHandlers) handler(event.key, event.data, etag);
}

/**
 * Put the remote bridge on `window.sero`.
 *
 * Called once, before the first widget mounts. A desktop bridge is never
 * present here, so nothing is overwritten.
 */
export function installRemoteSeroBridge(client: GatewayClient): void {
  const bridge = {
    appState: {
      read: async <T>(key: string): Promise<T> => {
        const result = await client.appStateGet<AppStateReadResult<T>>(key);
        return result.data;
      },
      write: async (): Promise<never> => {
        throw new Error(READ_ONLY_MESSAGE);
      },
      watch: async <T>(key: string): Promise<AppStateReadResult<T>> => {
        const result = await client.appStateWatch<AppStateReadResult<T>>(key);
        return { data: result.data, etag: result.etag };
      },
      unwatch: async (key: string): Promise<void> => {
        await client.appStateUnwatch(key);
      },
      onChange: (handler: ChangeHandler): (() => void) => {
        changeHandlers.add(handler);
        return () => {
          changeHandlers.delete(handler);
        };
      },
    },
    appAgent: {
      prompt: async (): Promise<never> => {
        throw new Error('Prompting from a widget is not available in a browser yet.');
      },
    },
  };

  Reflect.set(window, 'sero', bridge);
}
