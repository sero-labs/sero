// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DARK_COLORS, DEFAULT_LIGHT_COLORS, DEFAULT_THEME_ID } from '@/types/theme';
import { hydrateThemeStore, listenForTitleBarOverlaySync, useThemeStore } from './theme';
import { revertPreview } from '@/components/layout/theme/theme-editor/shared';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

const preset = {
  id: 'glass', name: 'Glass', version: 1 as const,
  colors: { light: DEFAULT_LIGHT_COLORS, dark: DEFAULT_DARK_COLORS },
  glass: { enabled: true, opacity: 0.2 },
};
const setGlassEffect = vi.fn().mockResolvedValue(null);
const setOverlayColors = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
  document.documentElement.className = '';
  useThemeStore.setState(useThemeStore.getInitialState(), true);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperty(window, 'sero', {
    configurable: true,
    value: {
      platform: 'win32',
      window: { setGlassEffect, setOverlayColors },
      themes: {
        list: vi.fn().mockResolvedValue([]),
        load: vi.fn().mockResolvedValue(preset),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'sero');
});

describe('native theme synchronization', () => {
  it.each(['select', 'delete'] as const)('keeps System appearance when returning to Default via %s', async (action) => {
    useThemeStore.setState({ mode: 'system', activePresetId: preset.id, activePreset: preset });
    if (action === 'select') await useThemeStore.getState().setPreset(DEFAULT_THEME_ID);
    else await useThemeStore.getState().deletePreset(preset.id);
    expect(setGlassEffect).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }), 'system');
  });

  it('sends mode changes for the Default theme to Electron', () => {
    useThemeStore.getState().setMode('light');
    expect(setGlassEffect).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }), 'light');
    useThemeStore.getState().setMode('system');
    expect(setGlassEffect).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }), 'system');
  });

  it('restores System appearance when hydrating Default', async () => {
    await hydrateThemeStore('system', DEFAULT_THEME_ID);
    expect(setGlassEffect).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }), 'system');
  });

  it('restores System appearance after a Default theme preview', () => {
    revertPreview(null, 'light', 'system');
    expect(setGlassEffect).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }), 'system');
  });

  it('sends opaque native overlay colors when glass is active and after reset', async () => {
    const stop = listenForTitleBarOverlaySync();
    try {
      await useThemeStore.getState().setPreset(preset.id);
      expect(document.documentElement.style.getPropertyValue('--bg-base')).toContain('color-mix(');
      expect(setOverlayColors).toHaveBeenLastCalledWith({
        color: DEFAULT_DARK_COLORS.bgBase, symbolColor: DEFAULT_DARK_COLORS.textSecondary,
      });
      await useThemeStore.getState().setPreset(DEFAULT_THEME_ID);
      document.documentElement.style.setProperty('--bg-base', '#112233');
      document.documentElement.style.setProperty('--text-secondary', '#aabbcc');
      useThemeStore.setState({ ready: true });
      expect(setOverlayColors).toHaveBeenLastCalledWith({ color: '#112233', symbolColor: '#aabbcc' });
    } finally {
      stop();
    }
  });
});
