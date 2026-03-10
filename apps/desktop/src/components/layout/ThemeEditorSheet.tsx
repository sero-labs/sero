/**
 * ThemeEditorSheet — full live theme editor in a right-side sheet.
 *
 * Separate from ThemePanel (which handles preset browsing/selection).
 * This editor lets users customise every token — colours, typography,
 * spacing, and radius — with instant live preview. Changes are applied
 * to the DOM in real-time via the theme engine; Save persists to disk.
 */

import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@sero/ui/components/ui/sheet';
import { Button } from '@sero/ui/components/ui/button';
import { useThemeStore } from '@/stores/theme';
import type {
  ThemePreset,
  TypographyTokens,
  SpacingTokens,
  RadiusTokens,
} from '@/types/theme';
import {
  DEFAULT_LIGHT_COLORS,
  DEFAULT_DARK_COLORS,
  DEFAULT_TYPOGRAPHY,
  DEFAULT_SPACING,
  DEFAULT_RADIUS,
} from '@/types/theme';
import { applyThemePreset, resetTheme } from '@/lib/theme-engine';
import { ModeToggle } from './theme-panel/ModeToggle';
import { ColorTab } from './theme-editor/ColorTab';
import { TypographyTab } from './theme-editor/TypographyTab';
import { LayoutTab } from './theme-editor/LayoutTab';
import type { ThemeEditorDraft } from './theme-editor/types';

// ── Types ────────────────────────────────────────────────────

interface ThemeEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, load this preset into the editor on open. */
  editPresetId?: string | null;
}

type EditorTab = 'colors' | 'typography' | 'layout';

const TAB_LABELS: Array<{ id: EditorTab; label: string }> = [
  { id: 'colors', label: 'Colours' },
  { id: 'typography', label: 'Typography' },
  { id: 'layout', label: 'Layout' },
];

// ── Component ────────────────────────────────────────────────

export function ThemeEditorSheet({
  open,
  onOpenChange,
  editPresetId,
}: ThemeEditorSheetProps) {
  const [tab, setTab] = useState<EditorTab>('colors');
  const [draft, setDraft] = useState<ThemeEditorDraft | null>(null);

  const effectiveMode = useThemeStore((s) => s.effectiveMode);
  const mode = useThemeStore((s) => s.mode);
  const activePreset = useThemeStore((s) => s.activePreset);
  const setMode = useThemeStore((s) => s.setMode);
  const setPreset = useThemeStore((s) => s.setPreset);
  const saveCustomPreset = useThemeStore((s) => s.saveCustomPreset);

  // ── Initialise / tear down draft on open/close ─────────────
  // React "adjust state during render" pattern — Radix Sheet's
  // onOpenChange only fires on user-initiated close, not when
  // the parent sets open={true}, so we detect the transition here.

  if (open && !draft) {
    setDraft(buildDraftFromPreset(activePreset, editPresetId));
    setTab('colors');
  }
  if (!open && draft) {
    setDraft(null);
  }

  const handleSheetClose = useCallback(
    (next: boolean) => {
      if (!next) {
        revertPreview(activePreset, effectiveMode);
      }
      onOpenChange(next);
    },
    [activePreset, effectiveMode, onOpenChange],
  );

  /** Push the current draft to the DOM for live preview. */
  const applyPreview = useCallback(
    (nextDraft: ThemeEditorDraft) => {
      const preset: ThemePreset = {
        id: '__editor_preview__',
        name: nextDraft.name || 'Untitled',
        version: 1,
        colors: nextDraft.colors,
        typography: nextDraft.typography,
        spacing: nextDraft.spacing,
        radius: nextDraft.radius,
      };
      applyThemePreset(preset, effectiveMode);
    },
    [effectiveMode],
  );

  // ── Field change handlers (update draft + live preview) ────

  const updateDraft = useCallback(
    (updater: (prev: ThemeEditorDraft) => ThemeEditorDraft) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        applyPreview(next);
        return next;
      });
    },
    [applyPreview],
  );

  const handleColorChange = useCallback(
    (key: string, value: string) => {
      updateDraft((prev) => ({
        ...prev,
        colors: {
          ...prev.colors,
          [effectiveMode]: {
            ...prev.colors[effectiveMode],
            [key]: value,
          },
        },
      }));
    },
    [updateDraft, effectiveMode],
  );

  const handleTypographyChange = useCallback(
    (key: keyof TypographyTokens, value: string) => {
      updateDraft((prev) => ({
        ...prev,
        typography: { ...prev.typography, [key]: value },
      }));
    },
    [updateDraft],
  );

  const handleSpacingChange = useCallback(
    (key: keyof SpacingTokens, value: string) => {
      updateDraft((prev) => ({
        ...prev,
        spacing: { ...prev.spacing, [key]: value },
      }));
    },
    [updateDraft],
  );

  const handleRadiusChange = useCallback(
    (key: keyof RadiusTokens, value: string) => {
      updateDraft((prev) => ({
        ...prev,
        radius: { ...prev.radius, [key]: value },
      }));
    },
    [updateDraft],
  );

  // ── Save ───────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!draft || !draft.name.trim()) return;
    const id = draft.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const preset: ThemePreset = {
      id,
      name: draft.name.trim(),
      description: draft.description || undefined,
      version: 1,
      colors: draft.colors,
      typography: draft.typography,
      spacing: draft.spacing,
      radius: draft.radius,
    };
    await saveCustomPreset(preset);
    await setPreset(id);
    setDraft(null);
    onOpenChange(false);
  }, [draft, saveCustomPreset, setPreset, onOpenChange]);

  // ── Cancel ─────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    revertPreview(activePreset, effectiveMode);
    setDraft(null);
    onOpenChange(false);
  }, [activePreset, effectiveMode, onOpenChange]);

  // ── Render ─────────────────────────────────────────────────

  const currentColors = draft?.colors[effectiveMode] ?? (
    effectiveMode === 'dark' ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS
  );

  return (
    <Sheet open={open} onOpenChange={handleSheetClose}>
      <SheetContent
        side="right"
        className="flex w-[420px] max-w-[90vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]"
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3">
          <SheetTitle className="text-sm">Theme Editor</SheetTitle>
          <SheetDescription className="sr-only">
            Create or edit a theme preset with live preview
          </SheetDescription>
        </SheetHeader>

        {draft && (
          <>
            {/* Name + description */}
            <div className="shrink-0 flex flex-col gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
              <input
                type="text"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => d ? { ...d, name: e.target.value } : d)
                }
                placeholder="Theme name…"
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
              />
              <input
                type="text"
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => d ? { ...d, description: e.target.value } : d)
                }
                placeholder="Description (optional)"
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--border-focus)]"
              />
            </div>

            {/* Mode toggle */}
            <div className="shrink-0 px-4 py-2 border-b border-[var(--border-subtle)]">
              <ModeToggle mode={mode} onModeChange={setMode} />
            </div>

            {/* Tab bar */}
            <div className="shrink-0 flex items-center gap-1 border-b border-[var(--border-subtle)] px-4 py-1.5">
              {TAB_LABELS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    tab === t.id
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Scrollable tab content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === 'colors' && (
                <ColorTab
                  colors={currentColors}
                  mode={effectiveMode}
                  onChange={handleColorChange}
                />
              )}
              {tab === 'typography' && (
                <TypographyTab
                  typography={draft.typography}
                  onChange={handleTypographyChange}
                />
              )}
              {tab === 'layout' && (
                <LayoutTab
                  spacing={draft.spacing}
                  radius={draft.radius}
                  onSpacingChange={handleSpacingChange}
                  onRadiusChange={handleRadiusChange}
                />
              )}
            </div>

            {/* Footer — save / cancel */}
            <div className="shrink-0 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!draft.name.trim()}
              >
                Save Theme
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function buildDraftFromPreset(
  source: ThemePreset | null,
  editPresetId?: string | null,
): ThemeEditorDraft {
  const isNew = !editPresetId || editPresetId === '__new__';
  const isBuiltin = source?.builtin === true;
  // Builtins are read-only — pre-fill name as "X (copy)" to force save-as
  const baseName = isNew ? '' : (source?.name ?? '');
  return {
    name: isBuiltin ? `${baseName} (copy)` : baseName,
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

function revertPreview(
  activePreset: ThemePreset | null,
  effectiveMode: 'light' | 'dark',
): void {
  resetTheme();
  if (activePreset) {
    applyThemePreset(activePreset, effectiveMode);
  } else {
    const root = document.documentElement;
    if (effectiveMode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }
}
