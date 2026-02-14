import { create } from 'zustand';
import type { SeroAppManifest } from '@/types/ipc';

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
  { id: 'coding', label: 'Coding', icon: '💻', builtin: true, manifest: null },
];

// ── Theme ──────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';

// ── Store ──────────────────────────────────────────────────────
interface AppState {
  // App registry
  apps: AppEntry[];
  setApps: (apps: AppEntry[]) => void;
  /** True once app discovery has completed (success or failure). */
  appsReady: boolean;

  // Main sidebar
  mainSidebarOpen: boolean;
  setMainSidebarOpen: (open: boolean) => void;
  toggleMainSidebar: () => void;

  // Chat panel
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  toggleChatPanel: () => void;

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

export const useAppStore = create<AppState>((set, get) => ({
  // App registry — starts with built-ins
  apps: [...BUILTIN_APPS],
  setApps: (apps) => set({ apps }),
  appsReady: false,

  // Main sidebar
  mainSidebarOpen: true,
  setMainSidebarOpen: (open) => set({ mainSidebarOpen: open }),
  toggleMainSidebar: () => set((s) => ({ mainSidebarOpen: !s.mainSidebarOpen })),

  // Chat panel
  chatPanelOpen: true,
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),

  // Active app
  activeApp: 'coding',
  setActiveApp: (app) => set({ activeApp: app }),

  // Theme
  theme: 'dark',
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
}));

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
