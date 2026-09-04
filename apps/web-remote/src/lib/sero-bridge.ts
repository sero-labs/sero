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
 * A write carries the etag the widget's state is based on, and the host
 * refuses it when the file moved. `useAppState` then re-applies the
 * change on top of the newer content, exactly as it does on the desktop.
 */

import { useChatStore } from '@/stores/chat';
import { useWorkspaceStore } from '@/stores/workspace';
import type { GatewayClient, GatewayMessage } from './gateway-client';

/** What the host answers a read or a watch with. */
interface AppStateReadResult<T> {
  data: T;
  etag: string | null;
}

type ChangeHandler = (key: string, data: unknown, etag: string | null) => void;

/** What the host answers a write with. Mirrors `AppStateWriteResult`. */
type WriteResult =
  | { ok: true; etag: string }
  | { ok: false; data: unknown; etag: string | null };

const changeHandlers = new Set<ChangeHandler>();

/** Hand an `app_state_changed` event to every watching widget. */
export function dispatchAppStateChange(msg: GatewayMessage): void {
  if (msg.type !== 'app_state_changed') return;
  const event = msg as unknown as { key?: unknown; data?: unknown; etag?: unknown };
  if (typeof event.key !== 'string') return;

  const etag = typeof event.etag === 'string' ? event.etag : null;
  for (const handler of changeHandlers) handler(event.key, event.data, etag);
}

/** Send a widget's prompt into the shell's conversation. */
function promptFromWidget(text: string): void {
  if (text.trim().length === 0) return;
  useChatStore.getState().sendMessage(text);
  useWorkspaceStore.getState().setView('chat');
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
      write: async (
        key: string,
        data: unknown,
        expectedEtag?: string | null,
      ): Promise<WriteResult> => {
        const result = await client.appStateSet<WriteResult & { key: string }>(
          key,
          data,
          expectedEtag,
        );
        return result.ok
          ? { ok: true, etag: result.etag }
          : { ok: false, data: result.data, etag: result.etag };
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
      /**
       * Send a widget's prompt to the conversation the shell is on.
       *
       * The shell owns session choice here, so the prompt lands where
       * the person can see it. The chat view opens for the same reason.
       */
      prompt: async (_appId: string, _workspaceId: string, text: string): Promise<string> => {
        promptFromWidget(text);
        return '';
      },
    },
  };

  Reflect.set(window, 'sero', bridge);
}
