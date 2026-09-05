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
  type ThemePreset,
} from '@sero-ai/ui/theme';
import { loadGoogleFont } from './google-fonts';

export { validateThemePreset };

function syncWindowGlass(preset?: ThemePreset): void {
  void window.sero?.window?.setGlassEffect(
    preset?.glass ?? DEFAULT_GLASS_EFFECT,
  );
}

export function applyThemePreset(
  preset: ThemePreset,
  mode: 'light' | 'dark',
): void {
  applySharedThemePreset(preset, mode, { loadFont: loadGoogleFont });
  syncWindowGlass(preset);
}

export function resetTheme(): void {
  resetSharedTheme();
  syncWindowGlass();
}
