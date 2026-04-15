import { useCallback, useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@/stores/theme';
import type {
  RadiusTokens,
  SpacingTokens,
  ThemePreset,
  TypographyTokens,
} from '@/types/theme';
import type { ThemeEditorDraft } from './types';
import {
  applyDraftPreview,
  buildDraftFromPreset,
  buildPresetFromDraft,
  type EditorTab,
  getDraftColors,
  revertPreview,
} from './shared';

interface UseThemeEditorStateOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPresetId?: string | null;
}

export function useThemeEditorState({
  open,
  onOpenChange,
  editPresetId,
}: UseThemeEditorStateOptions) {
  const [tab, setTab] = useState<EditorTab>('colors');
  const [draft, setDraft] = useState<ThemeEditorDraft | null>(null);
  const previousOpenRef = useRef<boolean | null>(null);

  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const mode = useThemeStore((state) => state.mode);
  const activePreset = useThemeStore((state) => state.activePreset);
  const setMode = useThemeStore((state) => state.setMode);
  const setPreset = useThemeStore((state) => state.setPreset);
  const saveCustomPreset = useThemeStore((state) => state.saveCustomPreset);

  useEffect(() => {
    const previousOpen = previousOpenRef.current;

    if (open && previousOpen !== true) {
      setDraft(buildDraftFromPreset(activePreset, editPresetId));
      setTab('colors');
    }

    if (!open && previousOpen === true) {
      setDraft(null);
    }

    previousOpenRef.current = open;
  }, [activePreset, editPresetId, open]);

  const updateDraft = useCallback(
    (updater: (previous: ThemeEditorDraft) => ThemeEditorDraft) => {
      setDraft((previous) => {
        if (!previous) {
          return previous;
        }

        const next = updater(previous);
        applyDraftPreview(next, effectiveMode);
        return next;
      });
    },
    [effectiveMode],
  );

  const handleSheetClose = useCallback(
    (next: boolean) => {
      if (!next) {
        revertPreview(activePreset, effectiveMode);
      }
      onOpenChange(next);
    },
    [activePreset, effectiveMode, onOpenChange],
  );

  const handleNewTheme = useCallback(() => {
    setDraft(buildDraftFromPreset(null, '__new__'));
    setTab('colors');
  }, []);

  const handleDraftNameChange = useCallback((value: string) => {
    setDraft((previous) => (previous ? { ...previous, name: value } : previous));
  }, []);

  const handleDraftDescriptionChange = useCallback((value: string) => {
    setDraft((previous) => (previous ? { ...previous, description: value } : previous));
  }, []);

  const handleColorChange = useCallback(
    (key: string, value: string) => {
      updateDraft((previous) => ({
        ...previous,
        colors: {
          ...previous.colors,
          [effectiveMode]: {
            ...previous.colors[effectiveMode],
            [key]: value,
          },
        },
      }));
    },
    [effectiveMode, updateDraft],
  );

  const handleTypographyChange = useCallback(
    (key: keyof TypographyTokens, value: string) => {
      updateDraft((previous) => ({
        ...previous,
        typography: { ...previous.typography, [key]: value },
      }));
    },
    [updateDraft],
  );

  const handleSpacingChange = useCallback(
    (key: keyof SpacingTokens, value: string) => {
      updateDraft((previous) => ({
        ...previous,
        spacing: { ...previous.spacing, [key]: value },
      }));
    },
    [updateDraft],
  );

  const handleRadiusChange = useCallback(
    (key: keyof RadiusTokens, value: string) => {
      updateDraft((previous) => ({
        ...previous,
        radius: { ...previous.radius, [key]: value },
      }));
    },
    [updateDraft],
  );

  const handleSave = useCallback(async () => {
    if (!draft || !draft.name.trim()) {
      return;
    }

    const preset = buildPresetFromDraft(draft);
    await saveCustomPreset(preset);
    await setPreset(preset.id);
    setDraft(null);
    onOpenChange(false);
  }, [draft, onOpenChange, saveCustomPreset, setPreset]);

  const handleReset = useCallback(async () => {
    if (!editPresetId || editPresetId === '__new__') {
      return;
    }

    const restored = await window.sero.themes.reset(editPresetId);
    if (!restored) {
      return;
    }

    const nextDraft = buildDraftFromPreset(restored, editPresetId);
    setDraft(nextDraft);
    applyDraftPreview(nextDraft, effectiveMode);
  }, [editPresetId, effectiveMode]);

  const handleCancel = useCallback(() => {
    revertPreview(activePreset, effectiveMode);
    setDraft(null);
    onOpenChange(false);
  }, [activePreset, effectiveMode, onOpenChange]);

  return {
    activePreset,
    currentColors: getDraftColors(draft, effectiveMode),
    draft,
    editPresetId,
    effectiveMode,
    mode,
    setMode,
    tab,
    setTab,
    handleCancel,
    handleColorChange,
    handleDraftDescriptionChange,
    handleDraftNameChange,
    handleNewTheme,
    handleRadiusChange,
    handleReset,
    handleSave,
    handleSheetClose,
    handleSpacingChange,
    handleTypographyChange,
  };
}
