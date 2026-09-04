import { beforeEach, describe, expect, it, vi } from 'vitest';

const savePref = vi.fn(async () => {});
const loadPref = vi.fn(async () => null as unknown);

vi.mock('@/lib/prefs-storage', () => ({
  savePref: (key: string, value: unknown) => savePref(key, value),
  loadPref: (key: string) => loadPref(key),
}));

import { initTheme, useThemeStore } from '@/stores/theme';

/** jsdom has no matchMedia; give it one whose result the test controls. */
function stubMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('theme store', () => {
  beforeEach(() => {
    savePref.mockClear();
    loadPref.mockClear();
    document.documentElement.classList.remove('dark');
    useThemeStore.setState({ mode: 'dark', effectiveMode: 'dark', ready: false });
  });

  it('adds the dark class for dark mode and removes it for light', () => {
    stubMatchMedia(false);
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useThemeStore.getState().setMode('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('resolves system mode from the media query', () => {
    stubMatchMedia(true);
    useThemeStore.getState().setMode('system');
    expect(useThemeStore.getState().effectiveMode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    stubMatchMedia(false);
    useThemeStore.getState().setMode('system');
    expect(useThemeStore.getState().effectiveMode).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('cycles dark → light → system → dark', () => {
    stubMatchMedia(false);
    const { cycleMode } = useThemeStore.getState();

    cycleMode();
    expect(useThemeStore.getState().mode).toBe('light');
    cycleMode();
    expect(useThemeStore.getState().mode).toBe('system');
    cycleMode();
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('persists every mode change', () => {
    stubMatchMedia(false);
    useThemeStore.getState().setMode('light');
    expect(savePref).toHaveBeenCalledWith('theme-mode', 'light');
  });

  it('restores the stored mode on init', async () => {
    stubMatchMedia(false);
    loadPref.mockResolvedValueOnce('light');

    initTheme();
    await vi.waitFor(() => expect(useThemeStore.getState().ready).toBe(true));

    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to dark when nothing is stored', async () => {
    stubMatchMedia(false);
    loadPref.mockResolvedValueOnce(null);

    initTheme();
    await vi.waitFor(() => expect(useThemeStore.getState().ready).toBe(true));

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
