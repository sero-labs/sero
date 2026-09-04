/**
 * Remote widgets store — which plugin widgets this client may load.
 *
 * The listing is fetched per workspace, because a workspace-scoped
 * widget reads a different state file in each one. A widget's fetch URL
 * carries a ticket, so the listing is refetched when the workspace
 * changes rather than cached forever.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import { dispatchAppStateChange } from '@/lib/sero-bridge';
import type { GatewayMessage } from '@/lib/gateway-client';

/** One widget the browser may mount. Mirrors the host's shape. */
export interface RemoteWidget {
  appId: string;
  appName: string;
  widgetId: string;
  name: string;
  component: string;
  description?: string;
  defaultSize: { w: number; h: number };
  remoteName: string;
  remoteEntry: string;
  stateKey: string;
  scope: 'global' | 'workspace';
}

interface WidgetsStore {
  widgets: RemoteWidget[];
  /** The workspace the current listing was fetched for. */
  loadedFor: string | null;
  isLoading: boolean;
  error: string | null;
  fetchWidgets: (workspaceId: string | null) => Promise<void>;
  handleMessage: (msg: GatewayMessage) => void;
}

function readWidget(value: unknown): RemoteWidget | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.appId !== 'string' || typeof record.widgetId !== 'string') return null;
  if (typeof record.remoteName !== 'string' || typeof record.remoteEntry !== 'string') return null;
  if (typeof record.component !== 'string' || typeof record.stateKey !== 'string') return null;

  const size = record.defaultSize as { w?: unknown; h?: unknown } | undefined;

  return {
    appId: record.appId,
    appName: typeof record.appName === 'string' ? record.appName : record.appId,
    widgetId: record.widgetId,
    name: typeof record.name === 'string' ? record.name : record.widgetId,
    component: record.component,
    description: typeof record.description === 'string' ? record.description : undefined,
    defaultSize: {
      w: typeof size?.w === 'number' ? size.w : 4,
      h: typeof size?.h === 'number' ? size.h : 3,
    },
    remoteName: record.remoteName,
    remoteEntry: record.remoteEntry,
    stateKey: record.stateKey,
    scope: record.scope === 'workspace' ? 'workspace' : 'global',
  };
}

export const useWidgetsStore = create<WidgetsStore>((set, get) => ({
  widgets: [],
  loadedFor: null,
  isLoading: false,
  error: null,

  fetchWidgets: async (workspaceId: string | null) => {
    const client = useConnectionStore.getState().client;
    if (!client) return;
    if (get().isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const data = await client.listRemoteWidgets<unknown>(workspaceId);
      const widgets = Array.isArray(data)
        ? data.map(readWidget).filter((widget): widget is RemoteWidget => widget !== null)
        : [];
      set({ widgets, loadedFor: workspaceId, isLoading: false });
    } catch (err) {
      set({
        widgets: [],
        loadedFor: workspaceId,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Could not list the widgets.',
      });
    }
  },

  handleMessage: (msg: GatewayMessage) => {
    dispatchAppStateChange(msg);
  },
}));
