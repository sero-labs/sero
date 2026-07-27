/**
 * Tweak manifest validation, value normalisation and effective-CSS resolution.
 *
 * Everything the preview and the export ever see passes through here. A model
 * can propose anything; only definitions that bind to a custom property the
 * generated stylesheet actually declares, and values that match their declared
 * control schema, survive.
 */

import {
  TWEAK_SCHEMA_VERSION,
  type DroppedTweakControl,
  type TweakControl,
  type TweakDefinition,
  type TweakManifest,
  type TweakValidationResult,
  type TweakValue,
} from './tweak-types';

const CSS_VARIABLE_PATTERN = /^--[A-Za-z0-9_-]+$/;
const CONTROL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const COLOUR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Values may never carry CSS syntax that could escape the declaration. */
const UNSAFE_VALUE_PATTERN = /[;{}<>()\\]|\/\*|url\s*:|expression|@import|javascript:/i;

export const MAX_TWEAK_CONTROLS = 32;
export const MAX_TWEAK_GROUPS = 8;

/** Fonts a generated design may offer — system stacks only, no network. */
export const APPROVED_FONT_VALUES = [
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTweakValue(value: unknown): value is TweakValue {
  return typeof value === 'string' || typeof value === 'boolean' || isFiniteNumber(value);
}

function safeStringValue(value: string): boolean {
  return value.length > 0 && value.length <= 120 && !UNSAFE_VALUE_PATTERN.test(value);
}

function validateControl(control: unknown): TweakControl | null {
  if (!control || typeof control !== 'object') return null;
  const candidate = control as Record<string, unknown>;

  switch (candidate.type) {
    case 'range': {
      const { min, max, step, unit } = candidate;
      if (!isFiniteNumber(min) || !isFiniteNumber(max) || !isFiniteNumber(step)) return null;
      if (max <= min || step <= 0) return null;
      if (unit !== undefined && (typeof unit !== 'string' || !safeStringValue(unit))) return null;
      return unit === undefined
        ? { type: 'range', min, max, step }
        : { type: 'range', min, max, step, unit };
    }
    case 'toggle': {
      const { offValue, onValue } = candidate;
      if (!isTweakValue(offValue) || !isTweakValue(onValue)) return null;
      if (typeof offValue === 'string' && !safeStringValue(offValue)) return null;
      if (typeof onValue === 'string' && !safeStringValue(onValue)) return null;
      return { type: 'toggle', offValue, onValue };
    }
    case 'colour':
      return { type: 'colour' };
    case 'choice': {
      const { options } = candidate;
      if (!Array.isArray(options) || options.length < 2 || options.length > 12) return null;
      const normalised: Array<{ label: string; value: TweakValue }> = [];
      for (const option of options) {
        if (!option || typeof option !== 'object') return null;
        const entry = option as Record<string, unknown>;
        if (typeof entry.label !== 'string' || !safeStringValue(entry.label)) return null;
        if (!isTweakValue(entry.value)) return null;
        if (typeof entry.value === 'string' && !safeStringValue(entry.value)) return null;
        normalised.push({ label: entry.label, value: entry.value });
      }
      return { type: 'choice', options: normalised };
    }
    default:
      return null;
  }
}

/** True when `value` is admissible for `control`. */
export function isValidTweakValue(control: TweakControl, value: unknown): value is TweakValue {
  if (!isTweakValue(value)) return false;

  switch (control.type) {
    case 'range':
      return isFiniteNumber(value) && value >= control.min && value <= control.max;
    case 'toggle':
      return value === control.offValue || value === control.onValue;
    case 'colour':
      return typeof value === 'string' && COLOUR_PATTERN.test(value);
    case 'choice':
      return control.options.some((option) => option.value === value);
  }
}

/** Snap a value onto the control's declared grid, or return null if invalid. */
export function normaliseTweakValue(control: TweakControl, value: unknown): TweakValue | null {
  if (control.type === 'range' && isFiniteNumber(value)) {
    // Out of range is a rejection, never a silent clamp: an out-of-range
    // generated default means the manifest disagrees with the stylesheet.
    if (value < control.min || value > control.max) return null;
    const steps = Math.round((value - control.min) / control.step);
    const snapped = Math.min(control.max, control.min + steps * control.step);
    // Avoid binary-float drift such as 1.7000000000000002.
    const rounded = Number(snapped.toFixed(6));
    return isValidTweakValue(control, rounded) ? rounded : null;
  }
  if (control.type === 'colour' && typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    return isValidTweakValue(control, lowered) ? lowered : null;
  }
  return isValidTweakValue(control, value) ? value : null;
}

/** The literal CSS a value produces for its control. */
export function tweakValueToCss(definition: TweakDefinition, value: TweakValue): string {
  if (definition.control.type === 'range') {
    const unit = definition.control.unit ?? '';
    return `${value}${unit}`;
  }
  return String(value);
}

/**
 * Validate a model-authored manifest against the stylesheet it claims to
 * control. A definition survives only when it is well formed, unique, and
 * binds to a custom property the generated CSS actually declares — the
 * "visibly affects the page" evidence required by the specification.
 */
export function validateTweakManifest(
  raw: unknown,
  variantRevisionId: string,
  declaredVariables: ReadonlySet<string>,
): TweakValidationResult {
  const dropped: DroppedTweakControl[] = [];
  const controls: TweakDefinition[] = [];
  const seenIds = new Set<string>();
  const seenVariables = new Set<string>();
  const groups = new Set<string>();

  const candidates = Array.isArray((raw as { controls?: unknown } | null)?.controls)
    ? ((raw as { controls: unknown[] }).controls)
    : [];

  for (const candidate of candidates) {
    const entry = (candidate ?? {}) as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const label = typeof entry.label === 'string' ? entry.label : id || 'Unnamed control';
    const drop = (reason: string) => dropped.push({ id: id || label, label, reason });

    if (!CONTROL_ID_PATTERN.test(id)) {
      drop('The control id is missing or unusable.');
      continue;
    }
    if (seenIds.has(id)) {
      drop('Another control already uses this id.');
      continue;
    }
    if (typeof entry.group !== 'string' || !safeStringValue(entry.group)) {
      drop('The control has no usable group.');
      continue;
    }
    if (!safeStringValue(label)) {
      drop('The control label is missing or unusable.');
      continue;
    }
    const cssVariable = typeof entry.cssVariable === 'string' ? entry.cssVariable : '';
    if (!CSS_VARIABLE_PATTERN.test(cssVariable)) {
      drop('The control does not name a CSS custom property.');
      continue;
    }
    if (!declaredVariables.has(cssVariable)) {
      drop(`The design does not declare ${cssVariable}, so the control would do nothing.`);
      continue;
    }
    if (seenVariables.has(cssVariable)) {
      drop(`Another control already changes ${cssVariable}.`);
      continue;
    }
    const control = validateControl(entry.control);
    if (!control) {
      drop('The control definition is not a supported range, toggle, colour or choice.');
      continue;
    }
    const defaultValue = normaliseTweakValue(control, entry.defaultValue);
    if (defaultValue === null) {
      drop('The default value does not match the control definition.');
      continue;
    }
    if (groups.size >= MAX_TWEAK_GROUPS && !groups.has(entry.group)) {
      drop('The manifest already uses the maximum number of groups.');
      continue;
    }
    if (controls.length >= MAX_TWEAK_CONTROLS) {
      drop('The manifest already contains the maximum number of controls.');
      continue;
    }

    seenIds.add(id);
    seenVariables.add(cssVariable);
    groups.add(entry.group);
    controls.push({
      id,
      group: entry.group,
      label,
      cssVariable: cssVariable as `--${string}`,
      control,
      defaultValue,
    });
  }

  return {
    manifest: { schemaVersion: TWEAK_SCHEMA_VERSION, variantRevisionId, controls },
    dropped,
  };
}

/** Effective value for every control: override when present, else generated default. */
export function resolveTweakValues(
  manifest: TweakManifest,
  overrides: Record<string, TweakValue>,
): Record<string, TweakValue> {
  const resolved: Record<string, TweakValue> = {};
  for (const definition of manifest.controls) {
    const override = overrides[definition.id];
    const normalised = override === undefined ? null : normaliseTweakValue(definition.control, override);
    resolved[definition.id] = normalised ?? definition.defaultValue;
  }
  return resolved;
}

/** Drop overrides that no longer match the manifest (e.g. after reanalysis). */
export function pruneTweakOverrides(
  manifest: TweakManifest,
  overrides: Record<string, TweakValue>,
): Record<string, TweakValue> {
  const pruned: Record<string, TweakValue> = {};
  for (const definition of manifest.controls) {
    const value = overrides[definition.id];
    if (value === undefined) continue;
    const normalised = normaliseTweakValue(definition.control, value);
    if (normalised !== null && normalised !== definition.defaultValue) {
      pruned[definition.id] = normalised;
    }
  }
  return pruned;
}

export const TWEAK_SCOPE_SELECTOR = ':root';

/**
 * The scoped custom-property override block — what Copy CSS returns, what the
 * preview receives on load and what the export bakes in. Only declared
 * variables and normalised values can appear, so the block can never carry a
 * selector or a second declaration.
 */
export function buildTweakCss(
  manifest: TweakManifest,
  overrides: Record<string, TweakValue>,
  options: { includeDefaults?: boolean } = {},
): string {
  const resolved = resolveTweakValues(manifest, overrides);
  const lines: string[] = [];

  for (const definition of manifest.controls) {
    const value = resolved[definition.id];
    if (!options.includeDefaults && value === definition.defaultValue) continue;
    lines.push(`  ${definition.cssVariable}: ${tweakValueToCss(definition, value)};`);
  }

  if (lines.length === 0) return '';
  return `${TWEAK_SCOPE_SELECTOR} {\n${lines.join('\n')}\n}\n`;
}

/** Every `--custom-property:` declared by a stylesheet, for manifest validation. */
export function collectDeclaredCssVariables(css: string): Set<string> {
  const declared = new Set<string>();
  const pattern = /(--[A-Za-z0-9_-]+)\s*:/g;
  let match = pattern.exec(css);
  while (match !== null) {
    declared.add(match[1]);
    match = pattern.exec(css);
  }
  return declared;
}
