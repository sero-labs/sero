import {
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  DEFAULT_RADIUS,
  DEFAULT_SPACING,
  DEFAULT_TYPOGRAPHY,
} from '@/types/theme';
import type { ColorTokens, ThemePreset } from '@/types/theme';
import { applyThemePreset, resetTheme } from '@/lib/theme-engine';
import type { ThemeEditorDraft } from './types';

export type EditorTab = 'colors' | 'typography' | 'layout';

export const TAB_LABELS: Array<{ id: EditorTab; label: string }> = [
  { id: 'colors', label: 'Colours' },
  { id: 'typography', label: 'Typography' },
  { id: 'layout', label: 'Layout' },
];

export function buildDraftFromPreset(
  source: ThemePreset | null,
  editPresetId?: string | null,
): ThemeEditorDraft {
  const isNew = !editPresetId || editPresetId === '__new__';
  const baseName = isNew ? '' : (source?.name ?? '');

  return {
    name: baseName,
    description: isNew ? '' : (source?.description ?? ''),
    colors: {
      light: { ...(source?.colors.light ?? DEFAULT_LIGHT_COLORS) },
      dark: { ...(source?.colors.dark ?? DEFAULT_DARK_COLORS) },
    },
    typography: {
      ...DEFAULT_TYPOGRAPHY,
      ...(source?.typography ?? {}),
    },
    spacing: {
      ...DEFAULT_SPACING,
      ...(source?.spacing ?? {}),
    },
    radius: {
      ...DEFAULT_RADIUS,
      ...(source?.radius ?? {}),
    },
  };
}

export function buildPresetFromDraft(draft: ThemeEditorDraft): ThemePreset {
  const name = draft.name.trim();
  const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  return {
    id,
    name,
    description: draft.description || undefined,
    version: 1,
    colors: draft.colors,
    typography: draft.typography,
    spacing: draft.spacing,
    radius: draft.radius,
  };
}

export function getDraftColors(
  draft: ThemeEditorDraft | null,
  effectiveMode: 'light' | 'dark',
): ColorTokens {
  if (draft) {
    return draft.colors[effectiveMode];
  }

  return effectiveMode === 'dark' ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS;
}

export function applyDraftPreview(
  draft: ThemeEditorDraft,
  effectiveMode: 'light' | 'dark',
): void {
  applyThemePreset(
    {
      id: '__editor_preview__',
      name: draft.name || 'Untitled',
      version: 1,
      colors: draft.colors,
      typography: draft.typography,
      spacing: draft.spacing,
      radius: draft.radius,
    },
    effectiveMode,
  );
}

export function revertPreview(
  activePreset: ThemePreset | null,
  effectiveMode: 'light' | 'dark',
): void {
  resetTheme();
  if (activePreset) {
    applyThemePreset(activePreset, effectiveMode);
    return;
  }

  const root = document.documentElement;
  if (effectiveMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
