/**
 * Theme editor draft state — holds every editable field
 * so the editor can preview changes live and save to a preset.
 */

import type {
  ColorTokens,
  TypographyTokens,
  SpacingTokens,
  RadiusTokens,
} from '@/types/theme';

export interface ThemeEditorDraft {
  name: string;
  description: string;
  colors: { light: ColorTokens; dark: ColorTokens };
  typography: Required<TypographyTokens>;
  spacing: Required<SpacingTokens>;
  radius: Required<RadiusTokens>;
}
