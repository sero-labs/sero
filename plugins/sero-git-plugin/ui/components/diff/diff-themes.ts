/**
 * Theme bridge between Sero's editor theme picker and @pierre/diffs.
 *
 * The id→shiki-name table is shared (`@sero-ai/common`) so the diff pane
 * colours code exactly like the host editor does. Diff chrome — fonts,
 * spacing — is aligned to host design tokens in `diff-view.css`.
 */

import type { ThemesType } from '@pierre/diffs';
import { resolveShikiThemePair } from '@sero-ai/common';

export function resolveDiffThemes(editorThemeId: string): ThemesType {
  const { light, dark } = resolveShikiThemePair(editorThemeId);
  return { light, dark };
}
