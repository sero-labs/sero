/**
 * Push store — whether this phone gets notifications with the app shut.
 *
 * The host says whether push works at all. The browser says whether the
 * person allowed it. Both must be true, so both are held here.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import {
  pushSupported,
  subscribeBrowser,
  unsubscribeBrowser,
  type PushStatus,
} from '@/lib/push';

export type PushState =
  /** The host or the browser cannot do push. */
  | 'unavailable'
  /** Push is possible, and this phone is not signed up. */
  | 'off'
  /** This phone is signed up. */
  | 'on'
  /** Waiting on the person, or on the browser. */
  | 'working';

interface PushStore {
  state: PushState;
  /** Why push is unavailable, when there is something useful to say. */
  reason: string | null;
  publicKey: string | null;
  /** Ask the host whether push works here. Called once on connect. */
  refresh: () => Promise<void>;
  /** Sign this phone up. Asks the browser for permission. */
  enable: () => Promise<void>;
  /** Stop this phone's pushes. */
  disable: () => Promise<void>;
}

function readStatus(value: unknown): PushStatus {
  if (!value || typeof value !== 'object') return { enabled: false, publicKey: null };
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    publicKey: typeof record.publicKey === 'string' ? record.publicKey : null,
  };
}

export const usePushStore = create<PushStore>((set, get) => ({
  state: 'unavailable',
  reason: null,
  publicKey: null,

  refresh: async () => {
    if (!pushSupported()) {
      set({
        state: 'unavailable',
        reason: 'This browser needs an HTTPS address to send notifications.',
      });
      return;
    }

    const client = useConnectionStore.getState().client;
    if (!client) return;

    try {
      const status = readStatus(await client.pushStatus());
      if (!status.enabled || !status.publicKey) {
        set({ state: 'unavailable', reason: 'Push is off on this Sero machine.' });
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration('/');
      const existing = await registration?.pushManager.getSubscription();
      set({
        publicKey: status.publicKey,
        reason: null,
        state: existing && Notification.permission === 'granted' ? 'on' : 'off',
      });
    } catch {
      set({ state: 'unavailable', reason: 'Could not reach Sero to set up notifications.' });
    }
  },

  enable: async () => {
    const { publicKey } = get();
    const client = useConnectionStore.getState().client;
    if (!publicKey || !client) return;

    set({ state: 'working' });
    const keys = await subscribeBrowser(publicKey);
    if (!keys) {
      set({ state: 'off', reason: 'This browser did not allow notifications.' });
      return;
    }

    try {
      await client.pushSubscribe(keys.endpoint, keys.p256dh, keys.auth);
      set({ state: 'on', reason: null });
    } catch {
      set({ state: 'off', reason: 'Sero did not accept the subscription.' });
    }
  },

  disable: async () => {
    const client = useConnectionStore.getState().client;
    set({ state: 'working' });

    const endpoint = await unsubscribeBrowser();
    if (endpoint && client) {
      try {
        await client.pushUnsubscribe(endpoint);
      } catch {
        // The browser subscription is gone either way. A record left on
        // the host is pruned the first time a push comes back 410.
      }
    }
    set({ state: 'off', reason: null });
  },
}));
