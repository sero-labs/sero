// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { applyThemePreset, resetTheme, validateThemePreset } from './apply-theme';
import {
  DEFAULT_DARK_COLORS,
  DEFAULT_GLASS_EFFECT,
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

  it('separates translucent layers and retains solid popup colors', () => {
    applyThemePreset(createPreset({
      glass: { enabled: true, opacity: 0.64 },
    }), 'dark');

    const root = document.documentElement;
    expect(root.classList.contains('theme-glass')).toBe(true);
    expect(root.style.getPropertyValue('--bg-base')).toBe(
      'color-mix(in srgb, #0a0a0b 64%, transparent)',
    );
    expect(root.style.getPropertyValue('--bg-surface')).toBe(
      'color-mix(in srgb, #111113 18%, transparent)',
    );
    expect(root.style.getPropertyValue('--window-glass-opaque-surface')).toBe('#111113');
    expect(root.style.getPropertyValue('--bg-elevated')).toBe(
      'color-mix(in srgb, #fafafa 8%, transparent)',
    );
    expect(root.style.getPropertyValue('--window-glass-opaque-elevated')).toBe('#18181b');
    expect(root.style.getPropertyValue('--window-glass-sidebar')).toBe(
      'color-mix(in srgb, #111113 8%, transparent)',
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
    expect(root.style.getPropertyValue('--bg-surface')).toBe('#111113');
    expect(root.style.getPropertyValue('--bg-elevated')).toBe('#18181b');
    expect(root.style.getPropertyValue('--window-glass-opaque-surface')).toBe('');
    expect(root.style.getPropertyValue('--window-glass-sidebar')).toBe('');
    expect(root.style.getPropertyValue('--window-glass-opaque-base')).toBe('');
  });

  it('keeps panel boundaries and soft selections at zero window tint in light mode', () => {
    applyThemePreset(createPreset({
      glass: { enabled: true, opacity: 0 },
    }), 'light');

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg-base')).toBe(
      'color-mix(in srgb, #ffffff 0%, transparent)',
    );
    expect(root.style.getPropertyValue('--window-glass-sidebar')).toBe(
      'color-mix(in srgb, #f4f5f7 8%, transparent)',
    );
  });

  it.each([
    [-1, 0],
    [2, 1],
  ])('clamps persisted glass opacity %s to %s', (opacity, expected) => {
    const preset = createPreset({ glass: { enabled: true, opacity } });

    expect(validateThemePreset(preset)?.glass).toEqual({
      ...DEFAULT_GLASS_EFFECT,
      enabled: true,
      opacity: expected,
    });
  });
  it.each(['light', 'dark'] as const)('can clear every local layer in %s mode independently of native material', (mode) => {
    const preset = createPreset({ glass: {
      enabled: true, opacity: 0, blurRadius: 32, windowsMaterial: 'acrylic', sidebarOpacity: 0,
      surfaceOpacity: 0, selectionOpacity: 0, borderOpacity: 0,
    } });
    const savedTheme = JSON.stringify(preset);
    const validated = validateThemePreset(JSON.parse(savedTheme));
    expect(validated?.glass).toEqual(preset.glass);
    if (!validated) throw new Error('Expected valid theme');
    applyThemePreset(validated, mode);
    const style = document.documentElement.style;
    for (const key of ['--bg-base', '--window-glass-sidebar', '--bg-surface', '--bg-elevated', '--border-default']) {
      expect(style.getPropertyValue(key)).toContain(' 0%, transparent)');
    }
    applyThemePreset({ ...validated, glass: { ...preset.glass!, surfaceOpacity: 0.4 } }, mode);
    expect(style.getPropertyValue('--bg-surface')).toContain(' 40%, transparent)');
    expect(style.getPropertyValue('--window-glass-sidebar')).toContain(' 0%, transparent)');
  });

  it('normalises invalid saved glass controls', () => {
    const preset = createPreset();
    const validated = validateThemePreset({ ...preset, glass: {
      enabled: true, opacity: NaN, sidebarOpacity: -1, surfaceOpacity: 4,
      selectionOpacity: Infinity, borderOpacity: 'bad', blurRadius: Infinity, windowsMaterial: 'invalid',
    } });
    expect(validated?.glass).toEqual({
      ...DEFAULT_GLASS_EFFECT, enabled: true, sidebarOpacity: 0, surfaceOpacity: 1,
    });
  });

});
