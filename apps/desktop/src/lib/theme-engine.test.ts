// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DARK_COLORS, DEFAULT_LIGHT_COLORS } from '@/types/theme';
import { applyThemePreset, resetTheme } from './theme-engine';

describe('desktop theme engine', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'sero');
    resetTheme();
  });

  it('sends the selected appearance with the native glass effect', () => {
    const setGlassEffect = vi.fn();
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
      glass: { enabled: true, opacity: 0.12 },
    }, 'light', 'light');

    expect(setGlassEffect).toHaveBeenCalledWith(
      { enabled: true, opacity: 0.12 },
      'light',
    );
  });
});
