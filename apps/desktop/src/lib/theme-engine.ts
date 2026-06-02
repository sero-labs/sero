/**
 * Desktop theme engine wrapper.
 *
 * The renderer-safe theme implementation lives in @sero-ai/ui. Desktop adds
 * Google Font loading while keeping the legacy import path stable.
 */

import {
  applyThemePreset as applySharedThemePreset,
  resetTheme,
  validateThemePreset,
  type ThemePreset,
} from '@sero-ai/ui/theme';
import { loadGoogleFont } from './google-fonts';

export { resetTheme, validateThemePreset };

export function applyThemePreset(
  preset: ThemePreset,
  mode: 'light' | 'dark',
): void {
  applySharedThemePreset(preset, mode, { loadFont: loadGoogleFont });
}
