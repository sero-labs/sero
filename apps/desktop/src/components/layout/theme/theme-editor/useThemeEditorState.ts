import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import type {
  RadiusTokens,
  SpacingTokens,
  ThemePreset,
  ThemeGlassEffect,
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

const AUTO_SAVE_DELAY_MS = 400;

export function useThemeEditorState({
  open,
  onOpenChange,
  editPresetId,
}: UseThemeEditorStateOptions) {
  const [tab, setTab] = useState<EditorTab>('colors');
  const [draft, setDraft] = useState<ThemeEditorDraft | null>(null);
  const draftRef = useRef<ThemeEditorDraft | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoSaveDraftRef = useRef<ThemeEditorDraft | null>(null);
  const autoSaveInFlightRef = useRef<Promise<void> | null>(null);
  const previousOpenRef = useRef<boolean | null>(null);

  const autoSave = useAppStore((state) => state.themeEditorAutoSave);
  const setAutoSave = useAppStore((state) => state.setThemeEditorAutoSave);
  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const mode = useThemeStore((state) => state.mode);
  const activePreset = useThemeStore((state) => state.activePreset);
  const setMode = useThemeStore((state) => state.setMode);
  const setPreset = useThemeStore((state) => state.setPreset);
  const saveCustomPreset = useThemeStore((state) => state.saveCustomPreset);

  useEffect(() => {
    const previousOpen = previousOpenRef.current;

    if (open && previousOpen !== true) {
      const nextDraft = buildDraftFromPreset(activePreset, editPresetId);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setTab('colors');
    }

    if (!open && previousOpen === true) {
      draftRef.current = null;
      setDraft(null);
    }

    previousOpenRef.current = open;
  }, [activePreset, editPresetId, open]);

  const persistDraft = useCallback(
    async (nextDraft: ThemeEditorDraft) => {
      if (!nextDraft.name.trim()) {
        return;
      }

      const preset = buildPresetFromDraft(nextDraft);
      await saveCustomPreset(preset);
      await setPreset(preset.id);
    },
    [saveCustomPreset, setPreset],
  );

  const clearAutoSaveTimer = useCallback(() => {
    if (!autoSaveTimerRef.current) {
      return;
    }

    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }, []);

  const flushAutoSave = useCallback(
    async (latestDraft?: ThemeEditorDraft) => {
      clearAutoSaveTimer();
      if (latestDraft) {
        pendingAutoSaveDraftRef.current = latestDraft;
      }

      while (pendingAutoSaveDraftRef.current) {
        const inFlight = autoSaveInFlightRef.current;
        if (inFlight) {
          await inFlight;
          continue;
        }

        const nextDraft = pendingAutoSaveDraftRef.current;
        pendingAutoSaveDraftRef.current = null;
        let failed = false;
        const promise = persistDraft(nextDraft)
          .catch((err) => {
            failed = true;
            if (!pendingAutoSaveDraftRef.current) {
              pendingAutoSaveDraftRef.current = nextDraft;
            }
            console.warn('[theme-editor] Failed to auto-save theme draft:', err);
          })
          .finally(() => {
            if (autoSaveInFlightRef.current === promise) {
              autoSaveInFlightRef.current = null;
            }
          });
        autoSaveInFlightRef.current = promise;
        await promise;

        if (failed) {
          autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void flushAutoSave();
          }, AUTO_SAVE_DELAY_MS);
          return;
        }
      }
    },
    [clearAutoSaveTimer, persistDraft],
  );

  const scheduleAutoSave = useCallback(
    (nextDraft: ThemeEditorDraft) => {
      pendingAutoSaveDraftRef.current = nextDraft;
      clearAutoSaveTimer();
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveTimerRef.current = null;
        void flushAutoSave();
      }, AUTO_SAVE_DELAY_MS);
    },
    [clearAutoSaveTimer, flushAutoSave],
  );

  useEffect(() => () => clearAutoSaveTimer(), [clearAutoSaveTimer]);

  const updateDraft = useCallback(
    (updater: (previous: ThemeEditorDraft) => ThemeEditorDraft) => {
      const previous = draftRef.current;
      if (!previous) return;

      const next = updater(previous);
      draftRef.current = next;
      applyDraftPreview(next, effectiveMode);
      if (autoSave) {
        scheduleAutoSave(next);
      }
      setDraft(next);
    },
    [autoSave, effectiveMode, scheduleAutoSave],
  );

  const handleNewTheme = useCallback(() => {
    const nextDraft = buildDraftFromPreset(null, '__new__');
    draftRef.current = nextDraft;
    applyDraftPreview(nextDraft, effectiveMode);
    setDraft(nextDraft);
    setTab('colors');
  }, [effectiveMode]);

  const handleDraftNameChange = useCallback((value: string) => {
    const previous = draftRef.current;
    if (!previous) return;

    const next = { ...previous, name: value };
    draftRef.current = next;
    if (autoSave) {
      scheduleAutoSave(next);
    }
    setDraft(next);
  }, [autoSave, scheduleAutoSave]);

  const handleDraftDescriptionChange = useCallback((value: string) => {
    const previous = draftRef.current;
    if (!previous) return;

    const next = { ...previous, description: value };
    draftRef.current = next;
    if (autoSave) {
      scheduleAutoSave(next);
    }
    setDraft(next);
  }, [autoSave, scheduleAutoSave]);

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

  const handleGlassChange = useCallback(
    (updates: Partial<ThemeGlassEffect>) => {
      updateDraft((previous) => ({
        ...previous,
        glass: { ...previous.glass, ...updates },
      }));
    },
    [updateDraft],
  );

  const handleSave = useCallback(async () => {
    const latestDraft = draftRef.current;
    if (!latestDraft || !latestDraft.name.trim()) {
      return;
    }

    await flushAutoSave(latestDraft);
    draftRef.current = null;
    setDraft(null);
    onOpenChange(false);
  }, [flushAutoSave, onOpenChange]);

  const handleReset = useCallback(async () => {
    if (!editPresetId || editPresetId === '__new__') {
      return;
    }

    const restored = await window.sero.themes.reset(editPresetId);
    if (!restored) {
      return;
    }

    const nextDraft = buildDraftFromPreset(restored, editPresetId);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    applyDraftPreview(nextDraft, effectiveMode);
  }, [editPresetId, effectiveMode]);

  const handleCancel = useCallback(() => {
    const latestDraft = draftRef.current;
    if (autoSave && latestDraft) {
      void flushAutoSave(latestDraft);
      draftRef.current = null;
      setDraft(null);
      onOpenChange(false);
      return;
    }

    revertPreview(activePreset, effectiveMode);
    draftRef.current = null;
    setDraft(null);
    onOpenChange(false);
  }, [activePreset, autoSave, effectiveMode, flushAutoSave, onOpenChange]);

  return {
    activePreset,
    autoSave,
    currentColors: getDraftColors(draft, effectiveMode),
    draft,
    editPresetId,
    effectiveMode,
    mode,
    setMode,
    setAutoSave,
    tab,
    setTab,
    handleCancel,
    handleColorChange,
    handleDraftDescriptionChange,
    handleDraftNameChange,
    handleGlassChange,
    handleNewTheme,
    handleRadiusChange,
    handleReset,
    handleSave,
    handleSpacingChange,
    handleTypographyChange,
  };
}
