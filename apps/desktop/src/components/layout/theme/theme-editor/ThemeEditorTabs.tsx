import { memo } from 'react';
import type {
  RadiusTokens,
  SpacingTokens,
  ThemeMode,
  ThemeGlassEffect,
  TypographyTokens,
} from '@/types/theme';
import type { ThemeEditorDraft } from './types';
import { ColorTab } from './ColorTab';
import { LayoutTab } from './LayoutTab';
import { TAB_LABELS, type EditorTab } from './shared';
import { TypographyTab } from './TypographyTab';
import { ModeToggle } from '../theme-panel/ModeToggle';

interface ThemeEditorTabsProps {
  currentColors: ThemeEditorDraft['colors']['light'];
  effectiveMode: 'light' | 'dark';
  mode: ThemeMode;
  onColorChange: (key: string, value: string) => void;
  onModeChange: (mode: ThemeMode) => void;
  onGlassChange: (updates: Partial<ThemeGlassEffect>) => void;
  onRadiusChange: (key: keyof RadiusTokens, value: string) => void;
  onSpacingChange: (key: keyof SpacingTokens, value: string) => void;
  onTabChange: (tab: EditorTab) => void;
  onTypographyChange: (key: keyof TypographyTokens, value: string) => void;
  radius: Required<RadiusTokens>;
  glass: ThemeGlassEffect;
  spacing: Required<SpacingTokens>;
  tab: EditorTab;
  typography: Required<TypographyTokens>;
}

export const ThemeEditorTabs = memo(function ThemeEditorTabs({
  currentColors,
  effectiveMode,
  mode,
  onColorChange,
  onModeChange,
  onGlassChange,
  onRadiusChange,
  onSpacingChange,
  onTabChange,
  onTypographyChange,
  radius,
  glass,
  spacing,
  tab,
  typography,
}: ThemeEditorTabsProps) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-2">
        <ModeToggle mode={mode} onModeChange={onModeChange} />
      </div>

      <div className="shrink-0 flex items-center gap-1 border-b border-[var(--border-subtle)] px-4 py-1.5">
        {TAB_LABELS.map((tabOption) => (
          <button
            key={tabOption.id}
            type="button"
            onClick={() => onTabChange(tabOption.id)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              tab === tabOption.id
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'colors' && (
          <ColorTab
            colors={currentColors}
            mode={effectiveMode}
            onChange={onColorChange}
          />
        )}
        {tab === 'typography' && (
          <TypographyTab
            typography={typography}
            onChange={onTypographyChange}
          />
        )}
        {tab === 'layout' && (
          <LayoutTab
            spacing={spacing}
            radius={radius}
            glass={glass}
            onSpacingChange={onSpacingChange}
            onRadiusChange={onRadiusChange}
            onGlassChange={onGlassChange}
          />
        )}
      </div>
    </>
  );
});
