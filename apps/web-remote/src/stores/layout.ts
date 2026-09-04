/**
 * Layout store — shell state the user expects to survive a reload:
 * sidebar width and collapsed state, and the open right panel.
 *
 * Persisted in IndexedDB. `localStorage` is not used.
 */

import { create } from 'zustand';
import { loadPref, savePref } from '@/lib/prefs-storage';

/** Right-hand panels, matching the activity rail order. */
export type RightPanel = 'files' | 'artifacts' | 'preview' | 'changes';

const PREF_KEY = 'layout';

/** Desktop default: 20% of the shell width, never under 200px. */
const DEFAULT_SIDEBAR_SIZE = '20%';

interface PersistedLayout {
  sidebarOpen: boolean;
  sidebarSize: string;
  rightPanel: RightPanel | null;
}

interface LayoutStore extends PersistedLayout {
  /** True once the stored layout has been read. */
  ready: boolean;

  toggleSidebar(): void;
  setSidebarOpen(open: boolean): void;
  setSidebarSize(size: string): void;
  /** Open a panel, or close it when it is already open. */
  toggleRightPanel(panel: RightPanel): void;
  closeRightPanel(): void;
}

const DEFAULTS: PersistedLayout = {
  sidebarOpen: true,
  sidebarSize: DEFAULT_SIDEBAR_SIZE,
  rightPanel: null,
};

function isRightPanel(value: unknown): value is RightPanel {
  return value === 'files' || value === 'artifacts' || value === 'preview' || value === 'changes';
}

function readPersisted(value: unknown): PersistedLayout {
  if (!value || typeof value !== 'object') return DEFAULTS;
  const stored = value as Partial<PersistedLayout>;
  return {
    sidebarOpen: typeof stored.sidebarOpen === 'boolean' ? stored.sidebarOpen : DEFAULTS.sidebarOpen,
    sidebarSize: typeof stored.sidebarSize === 'string' ? stored.sidebarSize : DEFAULTS.sidebarSize,
    rightPanel: isRightPanel(stored.rightPanel) ? stored.rightPanel : null,
  };
}

function persist(state: LayoutStore): void {
  void savePref(PREF_KEY, {
    sidebarOpen: state.sidebarOpen,
    sidebarSize: state.sidebarSize,
    rightPanel: state.rightPanel,
  } satisfies PersistedLayout);
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  ...DEFAULTS,
  ready: false,

  toggleSidebar: () => {
    set({ sidebarOpen: !get().sidebarOpen });
    persist(get());
  },

  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open });
    persist(get());
  },

  setSidebarSize: (size: string) => {
    if (size === get().sidebarSize) return;
    set({ sidebarSize: size });
    persist(get());
  },

  toggleRightPanel: (panel: RightPanel) => {
    set({ rightPanel: get().rightPanel === panel ? null : panel });
    persist(get());
  },

  closeRightPanel: () => {
    set({ rightPanel: null });
    persist(get());
  },
}));

/** True below the 768px breakpoint the layout treats as mobile. */
function isNarrowViewport(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Read the stored layout once at startup.
 *
 * On a narrow viewport the sidebar and the right panel are sheets that
 * cover the chat, so both start closed however the desktop left them.
 * The stored width is still restored: it applies the moment the window
 * grows past the breakpoint.
 */
export async function hydrateLayout(): Promise<void> {
  const stored = readPersisted(await loadPref(PREF_KEY));
  const narrow = isNarrowViewport();

  useLayoutStore.setState({
    ...stored,
    sidebarOpen: narrow ? false : stored.sidebarOpen,
    rightPanel: narrow ? null : stored.rightPanel,
    ready: true,
  });
}
