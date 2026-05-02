/**
 * useTheme — read the current theme mode and preset ID from app context.
 *
 * Most federated apps don't need this — CSS variables update automatically.
 * Use this hook when you need programmatic access to the theme (e.g. for
 * canvas rendering, charts, or conditional logic).
 */

import { useContext } from 'react';
import { AppContext } from './context';

export interface UseThemeResult {
  /** Current effective mode ('light' or 'dark'). */
  mode: 'light' | 'dark';
  /** Active theme preset ID. */
  presetId: string;
}

export function useTheme(): UseThemeResult {
  const ctx = useContext(AppContext);
  return {
    mode: ctx?.themeMode ?? 'dark',
    presetId: ctx?.themePresetId ?? 'default',
  };
}
