/**
 * Editor theme id → shiki theme names.
 *
 * Shared because three surfaces colour code from the same user setting: the
 * host's markdown code blocks and diff view, and the git plugin's diff pane.
 * Renderer-safe — names only, no shiki or Monaco imports.
 */

export const AUTO_EDITOR_THEME_ID = 'auto';

/**
 * Non-auto themes use the same shiki theme in both slots so code colours
 * follow the editor theme regardless of the app's light/dark mode.
 */
export const SHIKI_THEME_PAIRS = {
  vs: { light: 'light-plus', dark: 'light-plus' },
  'vs-dark': { light: 'dark-plus', dark: 'dark-plus' },
  'hc-light': { light: 'github-light-high-contrast', dark: 'github-light-high-contrast' },
  'hc-black': { light: 'github-dark-high-contrast', dark: 'github-dark-high-contrast' },
  'one-dark': { light: 'one-dark-pro', dark: 'one-dark-pro' },
  'github-light': { light: 'github-light', dark: 'github-light' },
  'github-dark': { light: 'github-dark', dark: 'github-dark' },
  dracula: { light: 'dracula', dark: 'dracula' },
  monokai: { light: 'monokai', dark: 'monokai' },
  'solarized-light': { light: 'solarized-light', dark: 'solarized-light' },
  'solarized-dark': { light: 'solarized-dark', dark: 'solarized-dark' },
  nord: { light: 'nord', dark: 'nord' },
  [AUTO_EDITOR_THEME_ID]: { light: 'github-light', dark: 'github-dark' },
} as const;

/** A bundled shiki theme name used by one of the pairs above. */
export type ShikiThemeName =
  (typeof SHIKI_THEME_PAIRS)[keyof typeof SHIKI_THEME_PAIRS]['light' | 'dark'];

export interface ShikiThemePair {
  light: ShikiThemeName;
  dark: ShikiThemeName;
}

export function resolveShikiThemePair(id: string): ShikiThemePair {
  const pairs: Record<string, ShikiThemePair> = SHIKI_THEME_PAIRS;
  return pairs[id] ?? SHIKI_THEME_PAIRS[AUTO_EDITOR_THEME_ID];
}
