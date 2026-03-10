/**
 * ThemePanel — dialog for browsing, customising, and managing theme presets.
 *
 * Accessible from TitleBar or ⌘K command menu. Provides:
 * - Light/Dark/System mode toggle
 * - Preset browser grid
 * - Colour customisation per token group
 * - Typography, spacing, radius controls
 * - Import/export/save preset actions
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
import type { ThemePreset, ColorTokens, ThemeMode } from '@/types/theme';
import {
  DEFAULT_THEME_ID,
  DEFAULT_LIGHT_COLORS,
  DEFAULT_DARK_COLORS,
} from '@/types/theme';
import { applyThemePreset, resetTheme } from '@/lib/theme-engine';
import { ModeToggle } from './theme-panel/ModeToggle';
import { PresetCard } from './theme-panel/PresetCard';
import { ColorSection } from './theme-panel/ColorSection';

interface ThemePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'presets' | 'customize';

export function ThemePanel({ open, onOpenChange }: ThemePanelProps) {
  const [tab, setTab] = useState<Tab>('presets');
  const [saveName, setSaveName] = useState('');
  const [editColors, setEditColors] = useState<{
    light: ColorTokens;
    dark: ColorTokens;
  } | null>(null);

  const mode = useThemeStore((s) => s.mode);
  const effectiveMode = useThemeStore((s) => s.effectiveMode);
  const activePresetId = useThemeStore((s) => s.activePresetId);
  const activePreset = useThemeStore((s) => s.activePreset);
  const presets = useThemeStore((s) => s.presets);
  const setMode = useThemeStore((s) => s.setMode);
  const setPreset = useThemeStore((s) => s.setPreset);
  const deletePreset = useThemeStore((s) => s.deletePreset);
  const saveCustomPreset = useThemeStore((s) => s.saveCustomPreset);
  const importPreset = useThemeStore((s) => s.importPreset);
  const exportPreset = useThemeStore((s) => s.exportPreset);

  // Initialise edit colours from the current state
  const startCustomising = useCallback(() => {
    const colors = activePreset?.colors ?? {
      light: { ...DEFAULT_LIGHT_COLORS },
      dark: { ...DEFAULT_DARK_COLORS },
    };
    setEditColors({
      light: { ...colors.light },
      dark: { ...colors.dark },
    });
    setTab('customize');
  }, [activePreset]);

  // Edit a colour for the currently-visible mode
  const handleModeColorChange = useCallback(
    (key: string, value: string) => {
      if (!editColors) return;
      const modeKey = effectiveMode;
      const next = {
        ...editColors,
        [modeKey]: { ...editColors[modeKey], [key]: value },
      };
      setEditColors(next);
      const previewPreset: ThemePreset = {
        id: '__preview__',
        name: 'Preview',
        version: 1,
        colors: next,
      };
      applyThemePreset(previewPreset, effectiveMode);
    },
    [editColors, effectiveMode],
  );

  const handleSavePreset = useCallback(async () => {
    if (!editColors || !saveName.trim()) return;
    const id = saveName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const preset: ThemePreset = {
      id,
      name: saveName.trim(),
      version: 1,
      colors: editColors,
    };
    await saveCustomPreset(preset);
    await setPreset(id);
    setSaveName('');
    setTab('presets');
    setEditColors(null);
  }, [editColors, saveName, saveCustomPreset, setPreset]);

  const handleCancelCustomise = useCallback(() => {
    // Remove all inline overrides injected by live preview
    resetTheme();
    // Re-apply the active preset (or just the mode class for default)
    if (activePreset) {
      applyThemePreset(activePreset, effectiveMode);
    } else {
      const root = document.documentElement;
      if (effectiveMode === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    }
    setEditColors(null);
    setTab('presets');
  }, [activePreset, effectiveMode]);

  const currentColors = editColors?.[effectiveMode] ?? (
    effectiveMode === 'dark' ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS
  );

  const colorGroups = buildColorGroups(currentColors);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Theme</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
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
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => { setTab('presets'); setEditColors(null); }}
            className={`text-xs font-medium px-2 py-1 rounded ${
              tab === 'presets'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Presets
          </button>
          <button
            type="button"
            onClick={startCustomising}
            className={`text-xs font-medium px-2 py-1 rounded ${
              tab === 'customize'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Customise
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto mt-2">
          {tab === 'presets' && (
            <PresetBrowser
              presets={presets}
              activePresetId={activePresetId}
              onSelect={setPreset}
              onDelete={deletePreset}
            />
          )}
          {tab === 'customize' && editColors && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[var(--text-muted)] px-1">
                Editing colours for <strong>{effectiveMode}</strong> mode.
                Changes preview live.
              </p>
              {colorGroups.map((group) => (
                <ColorSection
                  key={group.title}
                  title={group.title}
                  tokens={group.tokens}
                  onChange={handleModeColorChange}
                />
              ))}
              <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="flex-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-primary)]"
                />
                <Button size="xs" onClick={handleSavePreset} disabled={!saveName.trim()}>
                  Save as Preset
                </Button>
                <Button variant="ghost" size="xs" onClick={handleCancelCustomise}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function PresetBrowser({
  presets,
  activePresetId,
  onSelect,
  onDelete,
}: {
  presets: Array<{ id: string; name: string; description?: string; author?: string; builtin: boolean }>;
  activePresetId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // Always show default even if not in presets list
  const hasDefault = presets.some((p) => p.id === DEFAULT_THEME_ID);
  const allPresets = hasDefault
    ? presets
    : [{ id: DEFAULT_THEME_ID, name: 'Default', description: 'Sero default theme', builtin: true }, ...presets];

  return (
    <div className="grid grid-cols-2 gap-2">
      {allPresets.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          isActive={preset.id === activePresetId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

/** Build colour groups for the customisation sections. */
function buildColorGroups(colors: ColorTokens) {
  return [
    {
      title: 'Surfaces',
      tokens: [
        { key: 'bgBase', label: 'Base', value: colors.bgBase },
        { key: 'bgSurface', label: 'Surface', value: colors.bgSurface },
        { key: 'bgElevated', label: 'Elevated', value: colors.bgElevated },
        { key: 'bgOverlay', label: 'Overlay', value: colors.bgOverlay },
        { key: 'bgMuted', label: 'Muted', value: colors.bgMuted },
      ],
    },
    {
      title: 'Text',
      tokens: [
        { key: 'textPrimary', label: 'Primary', value: colors.textPrimary },
        { key: 'textSecondary', label: 'Secondary', value: colors.textSecondary },
        { key: 'textMuted', label: 'Muted', value: colors.textMuted },
        { key: 'textInverse', label: 'Inverse', value: colors.textInverse },
      ],
    },
    {
      title: 'Borders',
      tokens: [
        { key: 'borderSubtle', label: 'Subtle', value: colors.borderSubtle },
        { key: 'borderDefault', label: 'Default', value: colors.borderDefault },
        { key: 'borderFocus', label: 'Focus', value: colors.borderFocus },
      ],
    },
    {
      title: 'Accent',
      tokens: [
        { key: 'accentPrimary', label: 'Primary', value: colors.accentPrimary },
        { key: 'accentHover', label: 'Hover', value: colors.accentHover },
        { key: 'accentMuted', label: 'Muted', value: colors.accentMuted },
        { key: 'accentCode', label: 'Code', value: colors.accentCode },
      ],
    },
    {
      title: 'Status',
      tokens: [
        { key: 'statusSuccess', label: 'Success', value: colors.statusSuccess },
        { key: 'statusWarning', label: 'Warning', value: colors.statusWarning },
        { key: 'statusError', label: 'Error', value: colors.statusError },
        { key: 'statusInfo', label: 'Info', value: colors.statusInfo },
      ],
    },
    {
      title: 'Collaboration & Voice',
      tokens: [
        { key: 'collabPrimary', label: 'Collab', value: colors.collabPrimary },
        { key: 'voiceRecording', label: 'Recording', value: colors.voiceRecording },
        { key: 'voiceProcessing', label: 'Processing', value: colors.voiceProcessing },
        { key: 'bannerPrimary', label: 'Banner', value: colors.bannerPrimary },
      ],
    },
  ];
}
