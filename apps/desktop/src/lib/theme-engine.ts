/**
 * Theme engine — applies, resets, and validates theme presets.
 *
 * Themes work by overriding CSS custom properties on <html>.
 * The base values in globals.css serve as the "default" theme.
 * Custom themes inject inline style overrides that take precedence.
 */

import type {
  ThemePreset,
  ColorTokens,
  ThemePresetMeta,
} from '@/types/theme';

// ── Token → CSS Variable Mapping ─────────────────────────────

/** Maps ColorTokens keys to their CSS custom property names. */
const COLOR_TOKEN_TO_CSS: Record<keyof ColorTokens, string> = {
  bgBase: '--bg-base',
  bgSurface: '--bg-surface',
  bgElevated: '--bg-elevated',
  bgOverlay: '--bg-overlay',
  bgMuted: '--bg-muted',
  borderSubtle: '--border-subtle',
  borderDefault: '--border-default',
  borderFocus: '--border-focus',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  textInverse: '--text-inverse',
  accentPrimary: '--accent-primary',
  accentHover: '--accent-hover',
  accentMuted: '--accent-muted',
  accentCode: '--accent-code',
  statusSuccess: '--status-success',
  statusWarning: '--status-warning',
  statusError: '--status-error',
  statusInfo: '--status-info',
  collabPrimary: '--collab-primary',
  voiceRecording: '--voice-recording',
  voiceProcessing: '--voice-processing',
  bannerPrimary: '--banner-primary',
};

/**
 * Derived opacity variants generated from base status/collab/voice/banner colours.
 * Each entry is [css-var-name, base-token-key, opacity].
 */
const DERIVED_OPACITY_VARS: Array<[string, keyof ColorTokens, number]> = [
  ['--status-success-muted', 'statusSuccess', 0.10],
  ['--status-success-subtle', 'statusSuccess', 0.15],
  ['--status-success-faint', 'statusSuccess', 0.03],
  ['--status-success-border', 'statusSuccess', 0.20],
  ['--status-warning-muted', 'statusWarning', 0.10],
  ['--status-warning-subtle', 'statusWarning', 0.15],
  ['--status-warning-faint', 'statusWarning', 0.03],
  ['--status-warning-border', 'statusWarning', 0.20],
  ['--status-error-muted', 'statusError', 0.10],
  ['--status-error-subtle', 'statusError', 0.15],
  ['--status-error-faint', 'statusError', 0.03],
  ['--status-error-border', 'statusError', 0.20],
  ['--status-info-muted', 'statusInfo', 0.10],
  ['--status-info-subtle', 'statusInfo', 0.15],
  ['--status-info-faint', 'statusInfo', 0.03],
  ['--status-info-border', 'statusInfo', 0.20],
  ['--collab-primary-muted', 'collabPrimary', 0.10],
  ['--collab-primary-subtle', 'collabPrimary', 0.15],
  ['--collab-primary-border', 'collabPrimary', 0.20],
  ['--voice-recording-muted', 'voiceRecording', 0.20],
  ['--voice-processing-muted', 'voiceProcessing', 0.15],
  ['--banner-primary-muted', 'bannerPrimary', 0.10],
  ['--banner-primary-subtle', 'bannerPrimary', 0.15],
  ['--banner-primary-border', 'bannerPrimary', 0.20],
];

// ── Helpers ──────────────────────────────────────────────────

/** Parse a hex colour (#rrggbb or #rgb) to [r, g, b]. */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Create an rgba() string from a hex colour and opacity. */
function hexToRgba(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity.toFixed(2)})`;
}

// ── Apply / Reset ────────────────────────────────────────────

/**
 * Apply a theme preset for the given mode.
 * Sets CSS custom properties as inline styles on <html>.
 */
export function applyThemePreset(
  preset: ThemePreset,
  mode: 'light' | 'dark',
): void {
  const root = document.documentElement;
  const colors = mode === 'dark' ? preset.colors.dark : preset.colors.light;

  // Apply core colour tokens
  for (const [key, cssVar] of Object.entries(COLOR_TOKEN_TO_CSS)) {
    const value = colors[key as keyof ColorTokens];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }

  // Generate and apply derived opacity variants
  for (const [cssVar, baseKey, opacity] of DERIVED_OPACITY_VARS) {
    const baseColor = colors[baseKey];
    if (baseColor) {
      root.style.setProperty(cssVar, hexToRgba(baseColor, opacity));
    }
  }

  // Typography overrides
  if (preset.typography?.fontSans) {
    root.style.setProperty('--font-sans', preset.typography.fontSans);
  }
  if (preset.typography?.fontMono) {
    root.style.setProperty('--font-mono', preset.typography.fontMono);
  }
  if (preset.typography?.fontSizeBase) {
    root.style.setProperty('--font-size-base', preset.typography.fontSizeBase);
  }

  // Spacing overrides
  if (preset.spacing) {
    const spacingMap: Record<string, string> = {
      xs: '--space-xs',
      sm: '--space-sm',
      md: '--space-md',
      lg: '--space-lg',
      xl: '--space-xl',
    };
    for (const [key, cssVar] of Object.entries(spacingMap)) {
      const value = preset.spacing[key as keyof typeof preset.spacing];
      if (value) root.style.setProperty(cssVar, value);
    }
  }

  // Radius overrides
  if (preset.radius) {
    const radiusMap: Record<string, string> = {
      sm: '--sero-radius-sm',
      md: '--sero-radius-md',
      lg: '--sero-radius-lg',
    };
    for (const [key, cssVar] of Object.entries(radiusMap)) {
      const value = preset.radius[key as keyof typeof preset.radius];
      if (value) root.style.setProperty(cssVar, value);
    }
  }

  // Apply dark/light class
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/** All CSS custom properties managed by the theme engine. */
const ALL_MANAGED_VARS = [
  ...Object.values(COLOR_TOKEN_TO_CSS),
  ...DERIVED_OPACITY_VARS.map(([v]) => v),
  '--font-sans',
  '--font-mono',
  '--font-size-base',
  '--space-xs',
  '--space-sm',
  '--space-md',
  '--space-lg',
  '--space-xl',
  '--sero-radius-sm',
  '--sero-radius-md',
  '--sero-radius-lg',
];

/**
 * Remove all inline theme overrides, reverting to globals.css defaults.
 */
export function resetTheme(): void {
  const root = document.documentElement;
  for (const cssVar of ALL_MANAGED_VARS) {
    root.style.removeProperty(cssVar);
  }
}

// ── Validation ───────────────────────────────────────────────

/** Required keys in a ColorTokens object. */
const REQUIRED_COLOR_KEYS: Array<keyof ColorTokens> = [
  'bgBase', 'bgSurface', 'bgElevated', 'bgOverlay', 'bgMuted',
  'borderSubtle', 'borderDefault', 'borderFocus',
  'textPrimary', 'textSecondary', 'textMuted', 'textInverse',
  'accentPrimary', 'accentHover', 'accentMuted', 'accentCode',
  'statusSuccess', 'statusWarning', 'statusError', 'statusInfo',
  'collabPrimary', 'voiceRecording', 'voiceProcessing', 'bannerPrimary',
];

/** Validate that a value looks like a colour (hex, rgb, rgba, oklch, hsl). */
function isColorValue(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return /^(#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\()/.test(v.trim());
}

function isColorTokens(obj: unknown): obj is ColorTokens {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return REQUIRED_COLOR_KEYS.every((k) => isColorValue(o[k]));
}

/** Validate and extract only known typography keys. */
function sanitiseTypography(raw: unknown): ThemePreset['typography'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['fontSans', 'fontMono', 'fontSizeBase'] as const) {
    if (typeof o[key] === 'string') result[key] = o[key] as string;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Validate and extract only known spacing keys. */
function sanitiseSpacing(raw: unknown): ThemePreset['spacing'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
    if (typeof o[key] === 'string') result[key] = o[key] as string;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Validate and extract only known radius keys. */
function sanitiseRadius(raw: unknown): ThemePreset['radius'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['sm', 'md', 'lg'] as const) {
    if (typeof o[key] === 'string') result[key] = o[key] as string;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Validate and normalise an unknown value into a ThemePreset.
 * Returns null if the data is invalid.
 */
export function validateThemePreset(data: unknown): ThemePreset | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (typeof d.id !== 'string' || !d.id) return null;
  if (typeof d.name !== 'string' || !d.name) return null;
  if (d.version !== 1) return null;

  const colors = d.colors as Record<string, unknown> | undefined;
  if (!colors || typeof colors !== 'object') return null;
  if (!isColorTokens(colors.light) || !isColorTokens(colors.dark)) return null;

  return {
    id: d.id,
    name: d.name,
    description: typeof d.description === 'string' ? d.description : undefined,
    author: typeof d.author === 'string' ? d.author : undefined,
    version: 1,
    builtin: typeof d.builtin === 'boolean' ? d.builtin : false,
    colors: {
      light: colors.light as ColorTokens,
      dark: colors.dark as ColorTokens,
    },
    typography: sanitiseTypography(d.typography),
    spacing: sanitiseSpacing(d.spacing),
    radius: sanitiseRadius(d.radius),
  };
}

// ── Export / Serialisation ───────────────────────────────────

/** Extract metadata from a full preset. */
export function presetToMeta(preset: ThemePreset): ThemePresetMeta {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    author: preset.author,
    builtin: preset.builtin ?? false,
  };
}
