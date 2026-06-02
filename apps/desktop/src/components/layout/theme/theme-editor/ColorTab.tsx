/**
 * ColorTab, all colour token groups for the theme editor.
 * Renders one ColorSection per group for the currently active mode.
 */

import type { ColorTokens } from '@/types/theme';
import { ColorSection } from '@/components/layout/theme/theme-panel/ColorSection';

interface ColorTabProps {
  colors: ColorTokens;
  mode: 'light' | 'dark';
  onChange: (key: string, value: string) => void;
}

export function ColorTab({ colors, mode, onChange }: ColorTabProps) {
  const groups = buildColorGroups(colors);

  return (
    <div className="flex flex-col gap-0.5">
      {groups.map((group) => (
        <ColorSection
          key={group.title}
          title={group.title}
          tokens={group.tokens}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

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
      title: 'Brand',
      tokens: [
        { key: 'brandPrimary', label: 'Primary', value: colors.brandPrimary },
        { key: 'brandPrimaryHover', label: 'Primary Hover', value: colors.brandPrimaryHover },
        { key: 'brandPrimaryForeground', label: 'Primary Text', value: colors.brandPrimaryForeground },
        { key: 'brandSecondary', label: 'Secondary', value: colors.brandSecondary },
        { key: 'brandSecondaryHover', label: 'Secondary Hover', value: colors.brandSecondaryHover },
        { key: 'brandSecondaryForeground', label: 'Secondary Text', value: colors.brandSecondaryForeground },
      ],
    },
    {
      title: 'Accent & Code',
      tokens: [
        { key: 'accentPrimary', label: 'Legacy Accent', value: colors.accentPrimary },
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
