import type {
  ColorTokens,
  ThemePreset,
} from './types';

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
  brandPrimary: '--brand-primary',
  brandPrimaryHover: '--brand-primary-hover',
  brandPrimaryForeground: '--brand-primary-foreground',
  brandSecondary: '--brand-secondary',
  brandSecondaryHover: '--brand-secondary-hover',
  brandSecondaryForeground: '--brand-secondary-foreground',
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
 * Derived opacity variants generated from base semantic colours.
 * Each entry is [css-var-name, base-token-key, percentage].
 */
const DERIVED_OPACITY_VARS: Array<[string, keyof ColorTokens, number]> = [
  ['--brand-primary-muted', 'brandPrimary', 10],
  ['--brand-primary-subtle', 'brandPrimary', 15],
  ['--brand-primary-faint', 'brandPrimary', 3],
  ['--brand-primary-border', 'brandPrimary', 20],
  ['--brand-secondary-muted', 'brandSecondary', 10],
  ['--brand-secondary-subtle', 'brandSecondary', 15],
  ['--brand-secondary-faint', 'brandSecondary', 3],
  ['--brand-secondary-border', 'brandSecondary', 20],
  ['--status-success-muted', 'statusSuccess', 10],
  ['--status-success-subtle', 'statusSuccess', 15],
  ['--status-success-faint', 'statusSuccess', 3],
  ['--status-success-border', 'statusSuccess', 20],
  ['--status-warning-muted', 'statusWarning', 10],
  ['--status-warning-subtle', 'statusWarning', 15],
  ['--status-warning-faint', 'statusWarning', 3],
  ['--status-warning-border', 'statusWarning', 20],
  ['--status-error-muted', 'statusError', 10],
  ['--status-error-subtle', 'statusError', 15],
  ['--status-error-faint', 'statusError', 3],
  ['--status-error-border', 'statusError', 20],
  ['--status-info-muted', 'statusInfo', 10],
  ['--status-info-subtle', 'statusInfo', 15],
  ['--status-info-faint', 'statusInfo', 3],
  ['--status-info-border', 'statusInfo', 20],
  ['--collab-primary-muted', 'collabPrimary', 10],
  ['--collab-primary-subtle', 'collabPrimary', 15],
  ['--collab-primary-border', 'collabPrimary', 20],
  ['--voice-recording-muted', 'voiceRecording', 20],
  ['--voice-processing-muted', 'voiceProcessing', 15],
  ['--banner-primary-muted', 'bannerPrimary', 10],
  ['--banner-primary-subtle', 'bannerPrimary', 15],
  ['--banner-primary-border', 'bannerPrimary', 20],
];

export interface ApplyThemeOptions {
  loadFont?: (fontStack: string) => void;
}

function tint(color: string, percentage: number): string {
  return `color-mix(in srgb, ${color} ${percentage}%, transparent)`;
}

// ── Apply / Reset ────────────────────────────────────────────

/** Apply a theme preset for the given mode. */
export function applyThemePreset(
  preset: ThemePreset,
  mode: 'light' | 'dark',
  options: ApplyThemeOptions = {},
): void {
  const root = document.documentElement;
  const colors = mode === 'dark' ? preset.colors.dark : preset.colors.light;

  for (const [key, cssVar] of Object.entries(COLOR_TOKEN_TO_CSS)) {
    const value = colors[key as keyof ColorTokens];
    if (value) root.style.setProperty(cssVar, value);
  }

  for (const [cssVar, baseKey, percentage] of DERIVED_OPACITY_VARS) {
    const baseColor = colors[baseKey];
    if (baseColor) root.style.setProperty(cssVar, tint(baseColor, percentage));
  }

  if (preset.typography?.fontSans) {
    options.loadFont?.(preset.typography.fontSans);
    root.style.setProperty('--font-sans', preset.typography.fontSans);
  }
  if (preset.typography?.fontMono) {
    options.loadFont?.(preset.typography.fontMono);
    root.style.setProperty('--font-mono', preset.typography.fontMono);
  }
  if (preset.typography?.fontSizeBase) {
    root.style.setProperty('--font-size-base', preset.typography.fontSizeBase);
  }

  if (preset.spacing?.md) {
    const mdPx = parseFloat(preset.spacing.md);
    if (Number.isFinite(mdPx) && mdPx > 0) {
      root.style.setProperty('--spacing', `${(mdPx / 3).toFixed(3)}px`);
    }
  }

  if (preset.radius?.md) {
    root.style.setProperty('--radius', preset.radius.md);
  }

  root.classList.toggle('dark', mode === 'dark');
}

/** All CSS custom properties managed by the theme engine. */
const ALL_MANAGED_VARS = [
  ...Object.values(COLOR_TOKEN_TO_CSS),
  ...DERIVED_OPACITY_VARS.map(([v]) => v),
  '--font-sans',
  '--font-mono',
  '--font-size-base',
  '--spacing',
  '--radius',
];

/** Remove all inline theme overrides, reverting to CSS defaults. */
export function resetTheme(): void {
  const root = document.documentElement;
  for (const cssVar of ALL_MANAGED_VARS) {
    root.style.removeProperty(cssVar);
  }
}

// ── Validation ───────────────────────────────────────────────

const LEGACY_REQUIRED_COLOR_KEYS: Array<keyof ColorTokens> = [
  'bgBase', 'bgSurface', 'bgElevated', 'bgOverlay', 'bgMuted',
  'borderSubtle', 'borderDefault', 'borderFocus',
  'textPrimary', 'textSecondary', 'textMuted', 'textInverse',
  'accentPrimary', 'accentHover', 'accentMuted', 'accentCode',
  'statusSuccess', 'statusWarning', 'statusError', 'statusInfo',
  'collabPrimary', 'voiceRecording', 'voiceProcessing', 'bannerPrimary',
];

/** Validate that a value looks like a CSS colour. */
function isColorValue(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return /^(#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\(|color-mix\()/.test(v.trim());
}

function optionalColor(o: Record<string, unknown>, key: keyof ColorTokens): string | undefined {
  const value = o[key];
  return isColorValue(value) ? value : undefined;
}

function normaliseColorTokens(obj: unknown): ColorTokens | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (!LEGACY_REQUIRED_COLOR_KEYS.every((k) => isColorValue(o[k]))) return null;

  const legacy = o as Record<keyof ColorTokens, string>;
  return {
    ...legacy,
    brandPrimary: optionalColor(o, 'brandPrimary') ?? legacy.statusSuccess,
    brandPrimaryHover: optionalColor(o, 'brandPrimaryHover') ?? legacy.statusSuccess,
    brandPrimaryForeground: optionalColor(o, 'brandPrimaryForeground') ?? legacy.textInverse,
    brandSecondary: optionalColor(o, 'brandSecondary') ?? legacy.accentCode,
    brandSecondaryHover: optionalColor(o, 'brandSecondaryHover') ?? legacy.accentHover,
    brandSecondaryForeground: optionalColor(o, 'brandSecondaryForeground') ?? legacy.textInverse,
  };
}

function sanitiseTypography(raw: unknown): ThemePreset['typography'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['fontSans', 'fontMono', 'fontSizeBase'] as const) {
    if (typeof o[key] === 'string') result[key] = o[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitiseSpacing(raw: unknown): ThemePreset['spacing'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
    if (typeof o[key] === 'string') result[key] = o[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitiseRadius(raw: unknown): ThemePreset['radius'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['sm', 'md', 'lg'] as const) {
    if (typeof o[key] === 'string') result[key] = o[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Validate and normalise an unknown value into a ThemePreset. */
export function validateThemePreset(data: unknown): ThemePreset | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (typeof d.id !== 'string' || !d.id) return null;
  if (typeof d.name !== 'string' || !d.name) return null;
  if (d.version !== 1) return null;

  const colors = d.colors as Record<string, unknown> | undefined;
  const light = normaliseColorTokens(colors?.light);
  const dark = normaliseColorTokens(colors?.dark);
  if (!light || !dark) return null;

  return {
    id: d.id,
    name: d.name,
    description: typeof d.description === 'string' ? d.description : undefined,
    author: typeof d.author === 'string' ? d.author : undefined,
    version: 1,
    builtin: d.builtin === true,
    colors: { light, dark },
    typography: sanitiseTypography(d.typography),
    spacing: sanitiseSpacing(d.spacing),
    radius: sanitiseRadius(d.radius),
  };
}
