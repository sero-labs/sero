/**
 * ThemePanel — dialog for browsing and selecting theme presets.
 *
 * For full editing (colours, typography, spacing, radius), opens the
 * separate ThemeEditorSheet which provides live preview.
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sero/ui/components/ui/dialog';
import { Button } from '@sero/ui/components/ui/button';
import { useThemeStore } from '@/stores/theme';
import type { ThemeMode } from '@/types/theme';
import { DEFAULT_THEME_ID } from '@/types/theme';
import { ModeToggle } from './theme-panel/ModeToggle';
import { PresetCard } from './theme-panel/PresetCard';
import { ThemeEditorSheet } from './ThemeEditorSheet';

interface ThemePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemePanel({ open, onOpenChange }: ThemePanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editPresetId, setEditPresetId] = useState<string | null>(null);

  const mode = useThemeStore((s) => s.mode);
  const activePresetId = useThemeStore((s) => s.activePresetId);
  const presets = useThemeStore((s) => s.presets);
  const setMode = useThemeStore((s) => s.setMode);
  const setPreset = useThemeStore((s) => s.setPreset);
  const deletePreset = useThemeStore((s) => s.deletePreset);
  const importPreset = useThemeStore((s) => s.importPreset);
  const exportPreset = useThemeStore((s) => s.exportPreset);

  const handleEditPreset = useCallback((id: string) => {
    onOpenChange(false);
    setEditPresetId(id);
    setEditorOpen(true);
  }, [onOpenChange]);

  const handleNewTheme = useCallback(() => {
    onOpenChange(false);
    setEditPresetId('__new__');
    setEditorOpen(true);
  }, [onOpenChange]);

  // Always show default even if not in presets list
  const hasDefault = presets.some((p) => p.id === DEFAULT_THEME_ID);
  const allPresets = hasDefault
    ? presets
    : [{ id: DEFAULT_THEME_ID, name: 'Default', description: 'Sero default theme', builtin: true }, ...presets];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Themes</DialogTitle>
          </DialogHeader>

          {/* Mode toggle + actions */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <ModeToggle mode={mode} onModeChange={(m: ThemeMode) => setMode(m)} />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="xs" onClick={() => importPreset()}>
                Import
              </Button>
              {activePresetId !== DEFAULT_THEME_ID && (
                <Button variant="ghost" size="xs" onClick={() => exportPreset(activePresetId)}>
                  Export
                </Button>
              )}
              <Button size="xs" onClick={handleNewTheme}>
                New Theme
              </Button>
            </div>
          </div>

          {/* Preset grid */}
          <div className="flex-1 overflow-y-auto mt-2">
            <div className="grid grid-cols-2 gap-2">
              {allPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isActive={preset.id === activePresetId}
                  onSelect={setPreset}
                  onDelete={deletePreset}
                  onEdit={handleEditPreset}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ThemeEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editPresetId={editPresetId}
      />
    </>
  );
}
