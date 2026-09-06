/**
 * Desktop theme engine wrapper.
 *
 * The renderer-safe theme implementation lives in @sero-ai/ui. Desktop adds
 * Google Font loading while keeping the legacy import path stable.
 */

import {
  applyThemePreset as applySharedThemePreset,
  resetTheme as resetSharedTheme,
  validateThemePreset,
  DEFAULT_GLASS_EFFECT,
  type ThemeMode,
  type ThemePreset,
} from '@sero-ai/ui/theme';
import { loadGoogleFont } from './google-fonts';
import { useGlassStatusStore } from '@/stores/glass-status';

let glassRequest = 0;

export { validateThemePreset };

function syncWindowGlass(
  preset: ThemePreset | undefined,
  appearance: ThemeMode,
  mode: 'light' | 'dark',
): void {
  const request = ++glassRequest;
  const pending = window.sero?.window?.setGlassEffect(
    preset?.glass ?? DEFAULT_GLASS_EFFECT,
    appearance,
  );
  const report = (error: string | null) => {
    if (request !== glassRequest) return;
    useGlassStatusStore.setState({ error });
    if (error && preset) applySharedThemePreset({
      ...preset, glass: { ...DEFAULT_GLASS_EFFECT, ...preset.glass, enabled: false },
    }, mode, { loadFont: loadGoogleFont });
  };
  void pending?.then(report, (error: unknown) => {
    report(error instanceof Error ? error.message : 'Desktop blur is not available.');
  });
}

export function applyThemePreset(
  preset: ThemePreset,
  mode: 'light' | 'dark',
  appearance: ThemeMode = mode,
): void {
  const renderedPreset = window.sero?.platform === 'linux'
    ? { ...preset, glass: { ...DEFAULT_GLASS_EFFECT, ...preset.glass, enabled: false } }
    : preset;
  applySharedThemePreset(renderedPreset, mode, { loadFont: loadGoogleFont });
  syncWindowGlass(preset, appearance, mode);
}

export function resetTheme(appearance: ThemeMode): void {
  resetSharedTheme();
  syncWindowGlass(
    undefined,
    appearance,
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
}
