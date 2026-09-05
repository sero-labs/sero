/**
 * Shared Sero theme types and defaults.
 *
 * Presets are JSON-serialisable and map to CSS custom properties through
 * `applyThemePreset()`. Keep this package renderer-safe: no Electron APIs.
 */

// ── Colour Tokens ────────────────────────────────────────────

/** Core colour tokens that every theme defines for each mode. */
export interface ColorTokens {
  // Surfaces
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgOverlay: string;
  bgMuted: string;

  // Borders
  borderSubtle: string;
  borderDefault: string;
  borderFocus: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Brand
  brandPrimary: string;
  brandPrimaryHover: string;
  brandPrimaryForeground: string;
  brandSecondary: string;
  brandSecondaryHover: string;
  brandSecondaryForeground: string;

  // Legacy accent / syntax accent
  accentPrimary: string;
  accentHover: string;
  accentMuted: string;
  accentCode: string;

  // Status (solid)
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  statusInfo: string;

  // Collaboration
  collabPrimary: string;

  // Voice
  voiceRecording: string;
  voiceProcessing: string;

  // Banner / notification accent
  bannerPrimary: string;
}

/** Terminal ANSI colour overrides (optional per-theme). */
export interface TerminalColorTokens {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// ── Typography / Spacing / Radius ────────────────────────────

export interface TypographyTokens {
  fontSans?: string;
  fontMono?: string;
  fontSizeBase?: string;
}

export interface SpacingTokens {
  xs?: string;
  sm?: string;
  md?: string;
  lg?: string;
  xl?: string;
}

export interface RadiusTokens {
  sm?: string;
  md?: string;
  lg?: string;
}

export interface ThemeGlassEffect {
  /** Show the desktop through Sero's surfaces. */
  enabled: boolean;
  /** Window and sidebar tint opacity from 0 to 1. */
  opacity: number;
}

// ── Theme Preset ─────────────────────────────────────────────

export interface ThemePreset {
  /** Unique ID (slug or uuid). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Author name (for shared presets). */
  author?: string;
  /** Schema version for forward compatibility. */
  version: 1;
  /** Whether this is a built-in preset (read-only). */
  builtin?: boolean;

  /** Colour tokens — both modes required. */
  colors: {
    light: ColorTokens;
    dark: ColorTokens;
  };

  /** Terminal ANSI colours (optional — derived from status colours if absent). */
  terminal?: {
    light?: Partial<TerminalColorTokens>;
    dark?: Partial<TerminalColorTokens>;
  };

  /** Typography overrides. */
  typography?: TypographyTokens;

  /** Spacing scale overrides. */
  spacing?: SpacingTokens;

  /** Border radius overrides. */
  radius?: RadiusTokens;

  /** Optional translucent desktop window treatment. */
  glass?: ThemeGlassEffect;
}

/** Lightweight metadata for listing presets without loading full data. */
export interface ThemePresetMeta {
  id: string;
  name: string;
  description?: string;
  author?: string;
  builtin: boolean;
}

// ── Theme Mode ───────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

// ── Default Theme Constants ──────────────────────────────────

/** The default theme preset ID. */
export const DEFAULT_THEME_ID = 'default';

/** Default colour tokens matching globals.css :root values. */
export const DEFAULT_LIGHT_COLORS: ColorTokens = {
  bgBase: '#ffffff',
  bgSurface: '#f4f5f7',
  bgElevated: '#eaecf0',
  bgOverlay: '#dde0e6',
  bgMuted: '#c8ccd4',
  borderSubtle: '#d4d8e0',
  borderDefault: '#bcc1cc',
  borderFocus: '#059669',
  textPrimary: '#0f1117',
  textSecondary: '#3b4252',
  textMuted: '#6b7280',
  textInverse: '#fafafa',
  brandPrimary: '#059669',
  brandPrimaryHover: '#047857',
  brandPrimaryForeground: '#ffffff',
  brandSecondary: '#7c3aed',
  brandSecondaryHover: '#6d28d9',
  brandSecondaryForeground: '#ffffff',
  accentPrimary: '#7c3aed',
  accentHover: '#6d28d9',
  accentMuted: '#7c3aed1a',
  accentCode: '#7c3aed',
  statusSuccess: '#16a34a',
  statusWarning: '#d97706',
  statusError: '#dc2626',
  statusInfo: '#2563eb',
  collabPrimary: '#7c3aed',
  voiceRecording: '#f43f5e',
  voiceProcessing: '#06b6d4',
  bannerPrimary: '#7c3aed',
};

/** Default typography matching globals.css values. */
export const DEFAULT_TYPOGRAPHY: Required<TypographyTokens> = {
  fontSans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
  fontSizeBase: '14px',
};

/** Default spacing matching globals.css values. */
export const DEFAULT_SPACING: Required<SpacingTokens> = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '32px',
};

/** Default radius matching globals.css values. */
export const DEFAULT_RADIUS: Required<RadiusTokens> = {
  sm: '4px',
  md: '8px',
  lg: '12px',
};

export const DEFAULT_GLASS_EFFECT: ThemeGlassEffect = {
  enabled: false,
  opacity: 0.78,
};

/** Default colour tokens matching globals.css .dark values. */
export const DEFAULT_DARK_COLORS: ColorTokens = {
  bgBase: '#0a0a0b',
  bgSurface: '#111113',
  bgElevated: '#18181b',
  bgOverlay: '#1f1f23',
  bgMuted: '#27272a',
  borderSubtle: '#27272a',
  borderDefault: '#3f3f46',
  borderFocus: '#34d399',
  textPrimary: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  textInverse: '#09090b',
  brandPrimary: '#34d399',
  brandPrimaryHover: '#6ee7b7',
  brandPrimaryForeground: '#052e1c',
  brandSecondary: '#c4b5fd',
  brandSecondaryHover: '#ddd6fe',
  brandSecondaryForeground: '#1e1038',
  accentPrimary: '#c4b5fd',
  accentHover: '#ddd6fe',
  accentMuted: '#c4b5fd33',
  accentCode: '#c4b5fd',
  statusSuccess: '#22c55e',
  statusWarning: '#f59e0b',
  statusError: '#ef4444',
  statusInfo: '#3b82f6',
  collabPrimary: '#a78bfa',
  voiceRecording: '#fb7185',
  voiceProcessing: '#22d3ee',
  bannerPrimary: '#c4b5fd',
};
