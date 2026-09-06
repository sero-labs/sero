// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DARK_COLORS, DEFAULT_LIGHT_COLORS } from '@/types/theme';
import { useGlassStatusStore } from '@/stores/glass-status';
import { applyThemePreset, resetTheme } from './theme-engine';

describe('desktop theme engine', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'sero');
    resetTheme();
  });

  it('sends the selected appearance with the native glass effect', () => {
    const setGlassEffect = vi.fn().mockResolvedValue(null);
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: { window: { setGlassEffect } },
    });

    applyThemePreset({
      id: 'light-glass',
      name: 'Light glass',
      version: 1,
      colors: {
        light: { ...DEFAULT_LIGHT_COLORS },
        dark: { ...DEFAULT_DARK_COLORS },
      },
      glass: { enabled: true, opacity: 0.12, blurRadius: 32, windowsMaterial: 'acrylic' },
    }, 'light', 'light');

    expect(setGlassEffect).toHaveBeenCalledWith(
      { enabled: true, opacity: 0.12, blurRadius: 32, windowsMaterial: 'acrylic' },
      'light',
    );
  });
  it('keeps Linux opaque without changing the saved glass preset', async () => {
    const glass = { enabled: true, opacity: 0, blurRadius: 24 };
    const setGlassEffect = vi.fn().mockResolvedValue('Native blur unavailable');
    Object.defineProperty(window, 'sero', { configurable: true,
      value: { platform: 'linux', window: { setGlassEffect } } });
    applyThemePreset({ id: 'linux', name: 'Linux', version: 1,
      colors: { light: DEFAULT_LIGHT_COLORS, dark: DEFAULT_DARK_COLORS }, glass,
    }, 'light');
    expect(document.documentElement.classList.contains('theme-glass')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#ffffff');
    expect(glass.enabled).toBe(true);
    await Promise.resolve();
    expect(useGlassStatusStore.getState().error).toBe('Native blur unavailable');
  });

  it('ignores stale native errors and restores opaque backgrounds when the current effect fails', async () => {
    let finishFirst: (error: string | null) => void = () => {};
    const first = new Promise<string | null>((resolve) => { finishFirst = resolve; });
    const setGlassEffect = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(null)
      .mockResolvedValueOnce('Blur unavailable');
    Object.defineProperty(window, 'sero', { configurable: true,
      value: { platform: 'darwin', window: { setGlassEffect } } });
    const preset = { id: 'native', name: 'Native', version: 1 as const,
      colors: { light: DEFAULT_LIGHT_COLORS, dark: DEFAULT_DARK_COLORS },
      glass: { enabled: true, opacity: 0.2 },
    };
    applyThemePreset(preset, 'dark');
    applyThemePreset(preset, 'light');
    await Promise.resolve();
    finishFirst('Old failure');
    await Promise.resolve();
    expect(useGlassStatusStore.getState().error).toBeNull();
    expect(document.documentElement.classList.contains('theme-glass')).toBe(true);
    applyThemePreset(preset, 'light');
    await Promise.resolve();
    expect(document.documentElement.classList.contains('theme-glass')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#ffffff');
    expect(useGlassStatusStore.getState().error).toBe('Blur unavailable');
  });

});
