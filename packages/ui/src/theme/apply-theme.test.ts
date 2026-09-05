// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { applyThemePreset, resetTheme, validateThemePreset } from './apply-theme';
import {
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  type ThemePreset,
} from './types';

function createPreset(overrides: Partial<ThemePreset> = {}): ThemePreset {
  return {
    id: 'glass-test',
    name: 'Glass test',
    version: 1,
    colors: {
      light: { ...DEFAULT_LIGHT_COLORS },
      dark: { ...DEFAULT_DARK_COLORS },
    },
    ...overrides,
  };
}

describe('theme glass effect', () => {
  afterEach(() => resetTheme());

  it('makes the window base translucent while keeping working surfaces opaque', () => {
    applyThemePreset(createPreset({
      glass: { enabled: true, opacity: 0.64 },
    }), 'dark');

    const root = document.documentElement;
    expect(root.classList.contains('theme-glass')).toBe(true);
    expect(root.style.getPropertyValue('--bg-base')).toBe(
      'color-mix(in srgb, #0a0a0b 64%, transparent)',
    );
    expect(root.style.getPropertyValue('--bg-surface')).toBe('#111113');
    expect(root.style.getPropertyValue('--bg-elevated')).toBe('#18181b');
    expect(root.style.getPropertyValue('--window-glass-sidebar')).toBe(
      'color-mix(in srgb, #111113 64%, transparent)',
    );
    expect(root.style.getPropertyValue('--window-glass-opaque-base')).toBe(
      '#0a0a0b',
    );
  });

  it('restores opaque surfaces when the next theme disables glass', () => {
    applyThemePreset(createPreset({
      glass: { enabled: true, opacity: 0.64 },
    }), 'dark');
    applyThemePreset(createPreset(), 'dark');

    const root = document.documentElement;
    expect(root.classList.contains('theme-glass')).toBe(false);
    expect(root.style.getPropertyValue('--bg-base')).toBe('#0a0a0b');
    expect(root.style.getPropertyValue('--window-glass-sidebar')).toBe('');
    expect(root.style.getPropertyValue('--window-glass-opaque-base')).toBe('');
  });

  it('allows a clear window and sidebar tint in light mode', () => {
    applyThemePreset(createPreset({
      glass: { enabled: true, opacity: 0 },
    }), 'light');

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg-base')).toBe(
      'color-mix(in srgb, #ffffff 0%, transparent)',
    );
    expect(root.style.getPropertyValue('--window-glass-sidebar')).toBe(
      'color-mix(in srgb, #f4f5f7 0%, transparent)',
    );
  });

  it.each([
    [-1, 0],
    [2, 1],
  ])('clamps persisted glass opacity %s to %s', (opacity, expected) => {
    const preset = createPreset({ glass: { enabled: true, opacity } });

    expect(validateThemePreset(preset)?.glass).toEqual({
      enabled: true,
      opacity: expected,
    });
  });
});
