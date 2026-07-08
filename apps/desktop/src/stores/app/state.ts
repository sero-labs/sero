import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import {
  hasTransientRemote,
  preloadFederatedModule,
  refreshTransientRemote,
} from '@/lib/federation-registry';
import { useThemeStore } from '@/stores/theme';
import { useNavigationStore } from '@/stores/navigation';
import {
  BUILTIN_APP_IDS,
  BUILTIN_APPS,
  DEFAULT_FAVOURITE_APP_IDS,
  MAX_CHROME_SHORTCUTS,
  defaultChromeShortcuts,
  isManifestHostSupported,
  type AppEntry,
  type Theme,
} from './shared';

export interface AppState {
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
  chatCollaborationSizePct: number;
  setChatCollaborationSizePct: (pct: number) => void;

  // Favourites (sidebar-visible discovered apps)
  favouriteApps: string[];
  toggleFavourite: (appId: string) => void;
  isFavourite: (appId: string) => boolean;

  // Chrome shortcuts (apps pinned as chips in the title bar)
  chromeShortcuts: string[];
  toggleChromeShortcut: (appId: string) => void;
  isChromeShortcut: (appId: string) => boolean;

  // Active app
  activeApp: string;
  /** The app currently being preloaded before activation. */
  pendingApp: string | null;
  /** Pass `skipHistory` when re-activating an app from navigation history. */
  setActiveApp: (app: string, options?: { skipHistory?: boolean }) => void;
  reloadApp: (appId: string) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  themeEditorAutoSave: boolean;
  setThemeEditorAutoSave: (enabled: boolean) => void;

  // Monaco editor theme (separate from UI theme)
  editorThemeId: string;
  setEditorThemeId: (id: string) => void;
}

function preloadAndActivateApp(
  appId: string,
  component: string,
  devPort: number | undefined,
  remoteEntryOverride: string | null,
  set: (partial: Partial<AppState>) => void,
): void {
  const activate = () => {
    if (useAppStore.getState().pendingApp !== appId) return;
    set({ activeApp: appId, pendingApp: null });
    persistLayout({ activeApp: appId });
  };

  set({ pendingApp: appId });
  void preloadFederatedModule(appId, component, devPort, remoteEntryOverride)
    .catch((err) => {
      console.warn(`[app-store] Failed to preload ${appId}:`, err);
    })
    .finally(activate);
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
  chatCollaborationSizePct: 35,
  setChatCollaborationSizePct: (pct) => {
    set({ chatCollaborationSizePct: pct });
    persistLayout({ chatCollaborationSizePct: pct });
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

  // Chrome shortcuts — hydrated from layout (seeded from favourites on first run)
  chromeShortcuts: defaultChromeShortcuts(DEFAULT_FAVOURITE_APP_IDS),
  toggleChromeShortcut: (appId) => {
    const current = get().chromeShortcuts;
    const next = current.includes(appId)
      ? current.filter((id) => id !== appId)
      : [...current, appId];
    if (next.length > MAX_CHROME_SHORTCUTS) return;

    set({ chromeShortcuts: next });
    persistLayout({ chromeShortcuts: next });
  },
  isChromeShortcut: (appId) => get().chromeShortcuts.includes(appId),

  // Active app (hydrated from layout file on startup)
  activeApp: 'dashboard',
  pendingApp: null,
  setActiveApp: (app, options) => {
    const { activeApp, pendingApp, apps } = get();

    if (app === activeApp) {
      if (pendingApp) {
        set({ pendingApp: null });
        return;
      }

      const currentManifest = apps.find((candidate) => candidate.id === app)?.manifest;
      if (currentManifest?.component && hasTransientRemote(currentManifest.id)) {
        refreshTransientRemote(currentManifest.id);
        preloadAndActivateApp(
          currentManifest.id,
          currentManifest.component,
          currentManifest.devPort,
          currentManifest.remoteEntryOverride,
          set,
        );
      }
      return;
    }

    if (app === pendingApp) return;

    const entry = apps.find((candidate) => candidate.id === app);
    if (!entry) {
      console.warn(`[app-store] Ignoring unknown app: ${app}`);
      return;
    }

    if (!entry.builtin && !isManifestHostSupported(entry.manifest)) {
      console.warn(`[app-store] Ignoring unsupported plugin app: ${app}`);
      return;
    }

    if (!options?.skipHistory) {
      useNavigationStore.getState().push({ appId: app });
    }

    if (entry.manifest?.component) {
      refreshTransientRemote(entry.manifest.id);
      preloadAndActivateApp(
        entry.manifest.id,
        entry.manifest.component,
        entry.manifest.devPort,
        entry.manifest.remoteEntryOverride,
        set,
      );
      return;
    }

    set({ activeApp: app, pendingApp: null });
    persistLayout({ activeApp: app });
  },
  reloadApp: (appId) => {
    const entry = get().apps.find((candidate) => candidate.id === appId);
    if (!entry?.manifest?.component) {
      return;
    }

    refreshTransientRemote(entry.manifest.id);
    preloadAndActivateApp(
      entry.manifest.id,
      entry.manifest.component,
      entry.manifest.devPort,
      entry.manifest.remoteEntryOverride,
      set,
    );
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
  themeEditorAutoSave: false,
  setThemeEditorAutoSave: (enabled) => {
    set({ themeEditorAutoSave: enabled });
    persistLayout({ themeEditorAutoSave: enabled });
  },

  // Monaco editor theme — defaults to 'auto' which follows the UI mode.
  editorThemeId: 'auto',
  setEditorThemeId: (id) => {
    set({ editorThemeId: id });
    persistLayout({ editorThemeId: id });
  },
}));
