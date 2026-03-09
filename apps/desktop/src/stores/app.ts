import { create } from 'zustand';
import type { SeroAppManifest } from '@/types/ipc';
import { persistLayout } from '@/lib/persist-layout';

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
  { id: 'coding', label: 'Coding', icon: 'code', builtin: true, manifest: null },
];
const BUILTIN_APP_IDS = new Set(BUILTIN_APPS.map((app) => app.id));
const DEFAULT_FAVOURITE_APP_IDS = ['todo', 'notes', 'planmode'] as const;


// ── Theme ──────────────────────────────────────────────────────
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
  setActiveApp: (app: string) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

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
  activeApp: 'coding',
  setActiveApp: (app) => {
    set({ activeApp: app });
    persistLayout({ activeApp: app });
  },

  // Theme (hydrated from layout file on startup)
  theme: 'dark' as Theme,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    persistLayout({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
    persistLayout({ theme: next });
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
      // Hydrate theme
      if (state.theme === 'light' || state.theme === 'dark') {
        update.theme = state.theme;
        applyTheme(state.theme);
      }
      // Hydrate active app
      if (state.activeApp && typeof state.activeApp === 'string') {
        update.activeApp = state.activeApp;
      }
      useAppStore.setState(update);

      // Hydrate active workspace into workspace store (lazy import to avoid circular dep)
      if (state.activeWorkspaceId !== undefined) {
        const { useWorkspaceStore } = await import('@/stores/workspace');
        useWorkspaceStore.setState({ activeWorkspaceId: state.activeWorkspaceId ?? null });
      }
      // Hydrate active session into session store
      if (state.activeSessionId !== undefined) {
        const { useSessionStore } = await import('@/stores/sessions');
        useSessionStore.setState({ activeSessionId: state.activeSessionId ?? null });
      }
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
    useAppStore.setState({
      apps: [...BUILTIN_APPS, ...discovered],
      appsReady: true,
    });
  } catch (err) {
    console.error('[app-store] Failed to discover apps:', err);
    useAppStore.setState({ appsReady: true });
  }
}

/**
 * Listen for new app packages detected by the main process.
 * Call once on startup. Returns an unsubscribe function.
 */
export function listenForNewApps(): () => void {
  return window.sero.apps.onNewAppDetected((appName: string) => {
    console.log(`[app-store] New app detected: ${appName}`);
    useAppStore.setState({ pendingNewApp: appName });
  });
}
