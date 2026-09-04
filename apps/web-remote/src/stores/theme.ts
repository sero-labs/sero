/**
 * Theme store — mirrors the desktop `stores/theme.ts` mode handling.
 *
 * Modes are `light | dark | system`. The effective mode toggles the
 * `.dark` class on `<html>`, which is what `@sero-ai/ui` globals.css
 * keys every token off. Theme presets are a desktop-only feature: the
 * gateway exposes no preset request, so web-remote uses the default
 * tokens.
 *
 * The mode is persisted in IndexedDB. `localStorage` is not used.
 */

import { create } from 'zustand';
import { loadPref, savePref } from '@/lib/prefs-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

const PREF_KEY = 'theme-mode';
const DEFAULT_MODE: ThemeMode = 'dark';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemMode(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveEffectiveMode(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemMode() : mode;
}

/** Apply the dark/light class on `<html>`. */
function applyMode(mode: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

interface ThemeStoreState {
  /** User-selected mode. */
  mode: ThemeMode;
  /** Resolved mode, never `system`. */
  effectiveMode: 'light' | 'dark';
  /** True once the stored mode has been read. */
  ready: boolean;

  setMode(mode: ThemeMode): void;
  /** Cycle dark → light → system → dark, as the desktop does. */
  cycleMode(): void;
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  mode: DEFAULT_MODE,
  effectiveMode: resolveEffectiveMode(DEFAULT_MODE),
  ready: false,

  setMode: (mode: ThemeMode) => {
    const effective = resolveEffectiveMode(mode);
    applyMode(effective);
    set({ mode, effectiveMode: effective });
    void savePref(PREF_KEY, mode);
  },

  cycleMode: () => {
    const next: ThemeMode =
      get().mode === 'dark' ? 'light' : get().mode === 'light' ? 'system' : 'dark';
    get().setMode(next);
  },
}));

/**
 * Apply the default mode, read the stored mode, and follow the system
 * setting while the mode is `system`. Call once, before React renders,
 * so the first paint uses the stored mode.
 */
export function initTheme(): void {
  applyMode(resolveEffectiveMode(DEFAULT_MODE));

  void loadPref(PREF_KEY).then((stored) => {
    const mode = isThemeMode(stored) ? stored : DEFAULT_MODE;
    const effective = resolveEffectiveMode(mode);
    applyMode(effective);
    useThemeStore.setState({ mode, effectiveMode: effective, ready: true });
  });

  if (typeof window === 'undefined' || !window.matchMedia) return;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', () => {
    if (useThemeStore.getState().mode !== 'system') return;
    const effective = getSystemMode();
    applyMode(effective);
    useThemeStore.setState({ effectiveMode: effective });
  });
}
