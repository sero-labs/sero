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

  it('makes theme surfaces translucent while glass is enabled', () => {
    applyThemePreset(createPreset({
      glass: { enabled: true, opacity: 0.64 },
    }), 'dark');

    const root = document.documentElement;
    expect(root.classList.contains('theme-glass')).toBe(true);
    expect(root.style.getPropertyValue('--bg-base')).toBe(
      'color-mix(in srgb, #0a0a0b 64%, transparent)',
    );
    expect(root.style.getPropertyValue('--bg-surface')).toBe(
      'color-mix(in srgb, #111113 64%, transparent)',
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
  });

  it('normalises persisted glass controls', () => {
    const preset = createPreset({
      glass: { enabled: true, opacity: 2 },
    });

    expect(validateThemePreset(preset)?.glass).toEqual({
      enabled: true,
      opacity: 0.95,
    });
  });
});
