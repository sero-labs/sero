/**
 * Theme store — manages theme presets, mode (light/dark/system),
 * and applies CSS variable overrides via the theme engine.
 */

import { create } from 'zustand';
import type { ThemePreset, ThemePresetMeta, ThemeMode } from '@/types/theme';
import { DEFAULT_THEME_ID } from '@/types/theme';
import {
  applyThemePreset,
  resetTheme,
  validateThemePreset,
} from '@/lib/theme-engine';
import { persistLayout } from '@/lib/persist-layout';

// ── System theme detection ───────────────────────────────────

function getSystemMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveEffectiveMode(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemMode() : mode;
}

// ── Store ────────────────────────────────────────────────────

interface ThemeStoreState {
  /** All available presets (metadata only). */
  presets: ThemePresetMeta[];
  /** Currently active preset ID. */
  activePresetId: string;
  /** User-selected mode. */
  mode: ThemeMode;
  /** Resolved effective mode (never 'system'). */
  effectiveMode: 'light' | 'dark';
  /** The fully loaded active preset (null for default). */
  activePreset: ThemePreset | null;
  /** True once initial hydration is complete. */
  ready: boolean;

  // Actions
  loadPresets(): Promise<void>;
  setPreset(id: string): Promise<void>;
  setMode(mode: ThemeMode): void;
  toggleMode(): void;
  saveCustomPreset(preset: ThemePreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  importPreset(): Promise<ThemePreset | null>;
  exportPreset(id: string): Promise<boolean>;
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  presets: [],
  activePresetId: DEFAULT_THEME_ID,
  mode: 'dark',
  effectiveMode: 'dark',
  activePreset: null,
  ready: false,

  loadPresets: async () => {
    try {
      const presets = await window.sero.themes.list();
      set({ presets });
    } catch (err) {
      console.warn('[theme-store] Failed to load presets:', err);
    }
  },

  setPreset: async (id: string) => {
    const { mode } = get();
    const effective = resolveEffectiveMode(mode);

    if (id === DEFAULT_THEME_ID) {
      // Reset to CSS defaults
      resetTheme();
      applyMode(effective);
      set({ activePresetId: id, activePreset: null });
      persistLayout({ activeThemeId: id });
      return;
    }

    try {
      const raw = await window.sero.themes.load(id);
      const preset = validateThemePreset(raw);
      if (!preset) {
        console.warn(`[theme-store] Invalid theme preset: ${id}`);
        return;
      }
      applyThemePreset(preset, effective, mode);
      set({ activePresetId: id, activePreset: preset });
      persistLayout({ activeThemeId: id });
    } catch (err) {
      console.warn(`[theme-store] Failed to load preset ${id}:`, err);
    }
  },

  setMode: (mode: ThemeMode) => {
    const effective = resolveEffectiveMode(mode);
    const { activePreset } = get();

    if (activePreset) {
      applyThemePreset(activePreset, effective, mode);
    } else {
      applyMode(effective);
    }

    set({ mode, effectiveMode: effective });
    persistLayout({ theme: mode });
  },

  toggleMode: () => {
    const { mode } = get();
    const next: ThemeMode =
      mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark';
    get().setMode(next);
  },

  saveCustomPreset: async (preset: ThemePreset) => {
    await window.sero.themes.save(preset);
    await get().loadPresets();
  },

  deletePreset: async (id: string) => {
    await window.sero.themes.delete(id);
    // If deleting the active preset, switch to default
    if (get().activePresetId === id) {
      await get().setPreset(DEFAULT_THEME_ID);
    }
    await get().loadPresets();
  },

  importPreset: async () => {
    const raw = await window.sero.themes.import();
    const preset = validateThemePreset(raw);
    if (preset) {
      await get().loadPresets();
    }
    return preset;
  },

  exportPreset: async (id: string) => {
    return window.sero.themes.export(id);
  },
}));

// ── Helpers ──────────────────────────────────────────────────

/** Apply dark/light class on <html> without a custom preset. */
function applyMode(mode: 'light' | 'dark'): void {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// ── Windows title-bar overlay sync ───────────────────────────
// The native overlay buttons (min/max/close) are drawn by Windows and
// don't follow CSS — re-send the current chrome colors on theme change.
// The rAF lets the just-applied CSS variables resolve first.
function syncTitleBarOverlay(): void {
  requestAnimationFrame(() => {
    const styles = getComputedStyle(document.documentElement);
    const color = styles.getPropertyValue('--bg-base').trim();
    const symbolColor = styles.getPropertyValue('--text-secondary').trim();
    if (!color || !symbolColor) return;
    void window.sero.window.setOverlayColors({ color, symbolColor });
  });
}

/**
 * Keep the Windows overlay colors in sync with the theme. Call once on
 * startup (App.tsx). The `ready` transition covers initial hydration —
 * mode/preset changes fire before their CSS variables are applied, so a
 * sync on those alone would read stale colors on first launch.
 */
export function listenForTitleBarOverlaySync(): () => void {
  if (window.sero.platform !== 'win32') return () => {};
  return useThemeStore.subscribe((state, prev) => {
    if (
      state.ready !== prev.ready ||
      state.effectiveMode !== prev.effectiveMode ||
      state.activePreset !== prev.activePreset
    ) {
      syncTitleBarOverlay();
    }
  });
}

// ── Hydration ────────────────────────────────────────────────

/**
 * Hydrate the theme store from layout state.
 * Call once on startup after layout is loaded.
 */
export async function hydrateThemeStore(
  themeMode?: string,
  activeThemeId?: string,
): Promise<void> {
  const store = useThemeStore;

  // Parse mode (backward compat: 'dark'/'light' map directly)
  let mode: ThemeMode = 'dark';
  if (themeMode === 'light' || themeMode === 'dark' || themeMode === 'system') {
    mode = themeMode;
  }

  const effective = resolveEffectiveMode(mode);
  const presetId = activeThemeId ?? DEFAULT_THEME_ID;

  store.setState({ mode, effectiveMode: effective, activePresetId: presetId });

  // Load presets list
  try {
    const presets = await window.sero.themes.list();
    store.setState({ presets });
  } catch {
    // Presets list unavailable — not fatal
  }

  // Load and apply the active preset
  if (presetId !== DEFAULT_THEME_ID) {
    try {
      const raw = await window.sero.themes.load(presetId);
      const preset = validateThemePreset(raw);
      if (preset) {
        applyThemePreset(preset, effective, mode);
        store.setState({ activePreset: preset, ready: true });
        return;
      }
    } catch {
      // Fall through to default
    }
  }

  // Default preset: just apply mode class
  applyMode(effective);
  store.setState({ ready: true });
}

// ── System theme listener ────────────────────────────────────

/**
 * Listen for OS theme changes. When mode is 'system', auto-switch.
 * Call once on startup. Returns an unsubscribe function.
 */
export function listenForSystemThemeChanges(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    const { mode, activePreset } = useThemeStore.getState();
    if (mode !== 'system') return;

    const effective = getSystemMode();
    if (activePreset) {
      applyThemePreset(activePreset, effective, mode);
    } else {
      applyMode(effective);
    }
    useThemeStore.setState({ effectiveMode: effective });
  };

  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
