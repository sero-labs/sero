import { create } from 'zustand';
import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';
import { persistLayout } from '@/lib/persist-layout';
import {
  invalidateRemote,
  preloadFederatedModule,
  registerDynamicRemote,
} from '@/lib/federation-registry';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useThemeStore, hydrateThemeStore } from '@/stores/theme';
import { useModelPreferences } from '@/stores/model-preferences';
import { useDashboardStore } from '@/stores/dashboard';

// ── Built-in apps (always present) ────────────────────────────

export interface AppEntry {
  id: string;
  label: string;
  icon: string;
  /** True for built-in apps (coding, etc.), false for discovered sero apps. */
  builtin: boolean;
  /** Manifest for discovered sero apps (null for built-ins). */
  manifest: SeroAppManifest | null;
}

const BUILTIN_APPS: AppEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', builtin: true, manifest: null },
  { id: 'coding', label: 'Coding', icon: 'code', builtin: true, manifest: null },
];
const BUILTIN_APP_IDS = new Set(BUILTIN_APPS.map((app) => app.id));
const DEFAULT_FAVOURITE_APP_IDS = ['todo', 'notes', 'planmode'] as const;


// ── Theme (delegated to theme store) ──────────────────────────
export type Theme = 'dark' | 'light';

// ── Store ──────────────────────────────────────────────────────
interface AppState {
  // App registry
  apps: AppEntry[];
  setApps: (apps: AppEntry[]) => void;
  /** True once app discovery has completed (success or failure). */
  appsReady: boolean;
  /** True once layout state has been loaded from disk. */
  layoutReady: boolean;

  // New app detection
  /** Name of a newly detected app that requires restart. Null if none. */
  pendingNewApp: string | null;

  // Main sidebar
  mainSidebarOpen: boolean;
  setMainSidebarOpen: (open: boolean) => void;
  toggleMainSidebar: () => void;

  // Chat panel
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  toggleChatPanel: () => void;

  // Panel sizes (persisted percentages)
  mainSidebarSizePct: number;
  setMainSidebarSizePct: (pct: number) => void;
  chatPanelSizePct: number;
  setChatPanelSizePct: (pct: number) => void;

  // Favourites (sidebar-visible discovered apps)
  favouriteApps: string[];
  toggleFavourite: (appId: string) => void;
  isFavourite: (appId: string) => boolean;

  // Active app
  activeApp: string;
  /** The app currently being preloaded before activation. */
  pendingApp: string | null;
  setActiveApp: (app: string) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/** @deprecated Use useThemeStore().setMode() instead. Kept for backward compat. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/** Map a SeroAppManifest → AppEntry. */
function manifestToEntry(m: SeroAppManifest): AppEntry {
  // Use the icon name from manifest; sidebar will render it
  return {
    id: m.id,
    label: m.name,
    icon: m.icon,
    builtin: false,
    manifest: m,
  };
}

function normaliseFavouriteApps(favouriteApps: string[] | undefined): string[] {
  if (favouriteApps === undefined) return [...DEFAULT_FAVOURITE_APP_IDS];

  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of favouriteApps) {
    const normalized = id.trim();
    if (!normalized) continue;
    if (BUILTIN_APP_IDS.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}


export function getDiscoveredApps(apps: AppEntry[]): AppEntry[] {
  return apps.filter((app) => !app.builtin);
}

export function getSidebarApps(apps: AppEntry[], favouriteApps: string[]): AppEntry[] {
  const builtins = apps.filter((app) => app.builtin);
  const discoveredById = new Map<string, AppEntry>();
  for (const app of apps) {
    if (app.builtin) continue;
    discoveredById.set(app.id, app);
  }

  const favourites: AppEntry[] = [];
  for (const id of favouriteApps) {
    const app = discoveredById.get(id);
    if (app) favourites.push(app);
  }

  return [...builtins, ...favourites];
}

export function getPriorityPreloadApps(
  manifests: SeroAppManifest[],
  activeApp: string,
  favouriteApps: string[],
): SeroAppManifest[] {
  const priorityIds = new Set([activeApp, ...favouriteApps]);
  return manifests.filter((manifest) => manifest.component && priorityIds.has(manifest.id));
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function reconcileDiscoveredApps(discovered: AppEntry[]): void {
  const nextApps = [...BUILTIN_APPS, ...discovered];
  const { activeApp, pendingApp, favouriteApps } = useAppStore.getState();
  const validIds = new Set(nextApps.map((app) => app.id));

  const nextActiveApp = validIds.has(activeApp) ? activeApp : 'dashboard';
  const nextPendingApp = pendingApp && validIds.has(pendingApp) ? pendingApp : null;
  const nextFavouriteApps = favouriteApps.filter((id) => validIds.has(id) && !BUILTIN_APP_IDS.has(id));

  useAppStore.setState({
    apps: nextApps,
    activeApp: nextActiveApp,
    pendingApp: nextPendingApp,
    favouriteApps: nextFavouriteApps,
  });

  if (nextActiveApp !== activeApp) {
    persistLayout({ activeApp: nextActiveApp });
  }

  if (!areStringArraysEqual(nextFavouriteApps, favouriteApps)) {
    persistLayout({ favouriteApps: nextFavouriteApps });
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  // App registry — starts with built-ins
  apps: [...BUILTIN_APPS],
  setApps: (apps) => set({ apps }),
  appsReady: false,
  layoutReady: false,
  pendingNewApp: null,

  // Main sidebar — defaults to true; hydrated from disk by loadLayout()
  mainSidebarOpen: true,
  setMainSidebarOpen: (open) => {
    set({ mainSidebarOpen: open });
    persistLayout({ mainSidebarOpen: open });
  },
  toggleMainSidebar: () => {
    const next = !get().mainSidebarOpen;
    set({ mainSidebarOpen: next });
    persistLayout({ mainSidebarOpen: next });
  },

  // Chat panel — defaults to true; hydrated from disk by loadLayout()
  chatPanelOpen: true,
  setChatPanelOpen: (open) => {
    set({ chatPanelOpen: open });
    persistLayout({ chatPanelOpen: open });
  },
  toggleChatPanel: () => {
    const next = !get().chatPanelOpen;
    set({ chatPanelOpen: next });
    persistLayout({ chatPanelOpen: next });
  },

  // Panel sizes — defaults; hydrated from disk by loadLayout()
  mainSidebarSizePct: 20,
  setMainSidebarSizePct: (pct) => {
    set({ mainSidebarSizePct: pct });
    persistLayout({ mainSidebarSizePct: pct });
  },
  chatPanelSizePct: 30,
  setChatPanelSizePct: (pct) => {
    set({ chatPanelSizePct: pct });
    persistLayout({ chatPanelSizePct: pct });
  },

  favouriteApps: [...DEFAULT_FAVOURITE_APP_IDS],
  toggleFavourite: (appId) => {
    if (BUILTIN_APP_IDS.has(appId)) return;

    const current = get();
    const next = current.favouriteApps.includes(appId)
      ? current.favouriteApps.filter((id) => id !== appId)
      : [...current.favouriteApps, appId];

    set({ favouriteApps: next });
    persistLayout({ favouriteApps: next });
  },
  isFavourite: (appId) => get().favouriteApps.includes(appId),

  // Active app (hydrated from layout file on startup)
  activeApp: 'dashboard',
  pendingApp: null,
  setActiveApp: (app) => {
    const { activeApp, pendingApp, apps } = get();
    if (app === activeApp) {
      if (pendingApp) set({ pendingApp: null });
      return;
    }
    if (app === pendingApp) return;

    const entry = apps.find((candidate) => candidate.id === app);
    if (!entry) {
      console.warn(`[app-store] Ignoring unknown app: ${app}`);
      return;
    }
    const manifest = entry?.manifest;

    const activate = () => {
      if (get().pendingApp !== app) return;
      set({ activeApp: app, pendingApp: null });
      persistLayout({ activeApp: app });
    };

    if (manifest?.component) {
      set({ pendingApp: app });
      void preloadFederatedModule(manifest.id, manifest.component, manifest.devPort)
        .catch((err) => {
          console.warn(`[app-store] Failed to preload ${manifest.id}:`, err);
        })
        .finally(activate);
      return;
    }

    set({ activeApp: app, pendingApp: null });
    persistLayout({ activeApp: app });
  },

  // Theme — delegates to useThemeStore but keeps backward-compat surface
  theme: 'dark',
  setTheme: (theme) => {
    useThemeStore.getState().setMode(theme);
    set({ theme });
  },
  toggleTheme: () => {
    useThemeStore.getState().toggleMode();
    const effective = useThemeStore.getState().effectiveMode;
    set({ theme: effective });
  },
}));

// ── Layout hydration (call once on startup) ───────────────────

/** Load layout state from disk and hydrate all stores. */
export async function loadLayout(): Promise<void> {
  try {
    const state = await window.sero.layout.load();
    if (state) {
      const update: Partial<AppState> & { layoutReady: true } = {
        mainSidebarOpen: state.mainSidebarOpen,
        chatPanelOpen: state.chatPanelOpen,
        favouriteApps: normaliseFavouriteApps(state.favouriteApps),
        layoutReady: true,
      };
      if (typeof state.mainSidebarSizePct === 'number' && state.mainSidebarSizePct > 0) {
        update.mainSidebarSizePct = state.mainSidebarSizePct;
      }
      if (typeof state.chatPanelSizePct === 'number' && state.chatPanelSizePct > 0) {
        update.chatPanelSizePct = state.chatPanelSizePct;
      }
      // Hydrate theme via theme store (handles presets + mode)
      await hydrateThemeStore(state.theme, state.activeThemeId);
      const effective = useThemeStore.getState().effectiveMode;
      update.theme = effective;

      // Hydrate active app
      if (state.activeApp && typeof state.activeApp === 'string') {
        update.activeApp = state.activeApp;
      }
      useAppStore.setState(update);

      // Hydrate active workspace into workspace store
      if (state.activeWorkspaceId !== undefined) {
        useWorkspaceStore.setState({ activeWorkspaceId: state.activeWorkspaceId ?? null });
      }
      // Hydrate active session into session store
      if (state.activeSessionId !== undefined) {
        useSessionStore.setState({ activeSessionId: state.activeSessionId ?? null });
      }
      // Hydrate dashboard layout
      useDashboardStore.getState().hydrate(state.dashboardLayout);

      // Hydrate model preferences
      useModelPreferences.getState().hydrate({
        favouriteModels: state.favouriteModels,
        hiddenModels: state.hiddenModels,
        hiddenProviders: state.hiddenProviders,
      });
      return;
    }
  } catch (err) {
    console.warn('[app-store] Failed to load layout:', err);
  }
  useAppStore.setState({ layoutReady: true });
}

// ── Discovery action (call once on startup) ───────────────────

/**
 * Discover sero apps and merge them into the store.
 * Built-in apps are always first; discovered apps follow.
 */
export async function discoverAndRegisterApps(): Promise<void> {
  try {
    const manifests = await window.sero.apps.discover();
    const discovered = manifests.map(manifestToEntry);

    // Register app entries immediately (needed for sidebar rendering) and
    // reconcile favourites / active app if a plugin was removed.
    reconcileDiscoveredApps(discovered);

    // Only preload the active app + favourites — not all 20+ apps.
    // Other apps load on-demand inside a React transition (no flicker).
    const { activeApp, favouriteApps } = useAppStore.getState();
    const priorityApps = getPriorityPreloadApps(manifests, activeApp, favouriteApps);

    if (priorityApps.length > 0) {
      const PRELOAD_TIMEOUT_MS = 5000;
      const preloads = priorityApps.map((m) =>
        preloadFederatedModule(m.id, m.component!, m.devPort),
      );

      // Wait for priority preloads, but don't block forever if a remote is down
      await Promise.race([
        Promise.allSettled(preloads),
        new Promise<void>((resolve) => setTimeout(resolve, PRELOAD_TIMEOUT_MS)),
      ]);
    }

    useAppStore.setState({ appsReady: true });
  } catch (err) {
    console.error('[app-store] Failed to discover apps:', err);
    useAppStore.setState({ appsReady: true });
  }
}

/** Apply a plugin install/uninstall event to the runtime app registry. */
export async function handlePluginChange(event: PluginChangeEvent): Promise<void> {
  if (event.type === 'installed') {
    console.log(`[app-store] Plugin installed: ${event.manifest.name} (${event.manifest.id})`);
    invalidateRemote(event.manifest.id);
    registerDynamicRemote(event.manifest.id, event.manifest.devPort);
  } else {
    console.log(`[app-store] Plugin uninstalled: ${event.pluginId}`);
    invalidateRemote(event.pluginId);
  }

  await discoverAndRegisterApps();
}

/**
 * Listen for new app packages detected by the main process.
 * Call once on startup. Returns an unsubscribe function.
 */
export function listenForNewApps(): () => void {
  const unsubscribeApps = window.sero.apps.onNewAppDetected((appName: string) => {
    console.log(`[app-store] New app detected: ${appName}`);
    useAppStore.setState({ pendingNewApp: appName });
  });

  const unsubscribePlugins = window.sero.plugins.onChanged((event) => {
    void handlePluginChange(event).catch((err) => {
      console.warn('[app-store] Failed to apply plugin change:', err);
    });
  });

  return () => {
    unsubscribeApps();
    unsubscribePlugins();
  };
}
