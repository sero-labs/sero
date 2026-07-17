/**
 * Theme bridge between Sero's editor theme picker and @pierre/diffs.
 *
 * Diff code colors come from shiki themes (same mapping as markdown code
 * blocks); diff chrome (fonts, spacing) is aligned to the app's design
 * tokens via `--diffs-*` CSS variables in diff-view.css.
 */

import type { ThemesType } from '@pierre/diffs';
import { resolveShikiThemePair } from './monaco-themes';

/** Shiki theme pair for the diff view, derived from the editor theme id. */
export function resolveDiffThemes(editorThemeId: string): ThemesType {
  const { light, dark } = resolveShikiThemePair(editorThemeId);
  return { light, dark };
}
