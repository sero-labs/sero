/**
 * Theme system types — defines the shape of theme presets,
 * colour tokens, and related metadata.
 *
 * A ThemePreset is a JSON-serialisable object that contains
 * both light and dark colour palettes plus optional typography,
 * spacing, and radius overrides.
 */

// ── Colour Tokens ────────────────────────────────────────────

/** Core colour tokens that every theme must define for each mode. */
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

  // Accent
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
  borderFocus: '#6366f1',
  textPrimary: '#0f1117',
  textSecondary: '#3b4252',
  textMuted: '#6b7280',
  textInverse: '#fafafa',
  accentPrimary: '#6366f1',
  accentHover: '#6366f1',
  accentMuted: '#6366f11a',
  accentCode: '#7c3aed',
  statusSuccess: '#16a34a',
  statusWarning: '#d97706',
  statusError: '#dc2626',
  statusInfo: '#2563eb',
  collabPrimary: '#7c3aed',
  voiceRecording: '#f43f5e',
  voiceProcessing: '#06b6d4',
  bannerPrimary: '#6366f1',
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

/** Default colour tokens matching globals.css .dark values. */
export const DEFAULT_DARK_COLORS: ColorTokens = {
  bgBase: '#0a0a0b',
  bgSurface: '#111113',
  bgElevated: '#18181b',
  bgOverlay: '#1f1f23',
  bgMuted: '#27272a',
  borderSubtle: '#27272a',
  borderDefault: '#3f3f46',
  borderFocus: '#6366f1',
  textPrimary: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  textInverse: '#09090b',
  accentPrimary: '#6366f1',
  accentHover: '#818cf8',
  accentMuted: '#6366f133',
  accentCode: '#c4b5fd',
  statusSuccess: '#22c55e',
  statusWarning: '#f59e0b',
  statusError: '#ef4444',
  statusInfo: '#3b82f6',
  collabPrimary: '#a78bfa',
  voiceRecording: '#fb7185',
  voiceProcessing: '#22d3ee',
  bannerPrimary: '#818cf8',
};
