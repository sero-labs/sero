/**
 * Tweaks — the AI-authored controls that belong to one generated page (spec §6.5).
 *
 * A manifest is written by the run that produced the revision, from what it
 * actually emitted. Seven standard typography controls form the baseline; the
 * remaining groups, labels, ranges and options describe *that* page.
 *
 * Two rules hold the whole feature together, and everything below exists to keep
 * them:
 *
 * 1. **A control is a custom property and a value, never CSS.** What crosses into
 *    the preview is a declared property name and a short string. No selector, no
 *    stylesheet, no code — so a manifest cannot become an injection channel for
 *    the page it describes.
 * 2. **A control that changes nothing is not a control.** A definition bound to a
 *    property the page never declared, or declares and never reads, is dropped
 *    before it is ever shown. A slider that visibly does nothing is worse than a
 *    missing one: it makes the user doubt the ones that work.
 */

import { DESIGN_FONT_OPTIONS } from './fonts';

export const TWEAK_SCHEMA_VERSION = 2;

/** Enough for a control-heavy page; past this it is a settings screen. */
export const MAX_TWEAK_CONTROLS = 24;
export const MAX_TWEAK_OPTIONS = 8;

/**
 * The value a control carries. Deliberately narrow: these are JSON, they are
 * stored in the Design record, and they end up as a CSS value.
 */
export type TweakValue = string | number | boolean;

export type TweakControl =
  | { type: 'range'; min: number; max: number; step: number; unit?: string }
  | { type: 'toggle'; offValue: TweakValue; onValue: TweakValue }
  | { type: 'colour' }
  | { type: 'choice'; options: TweakOption[] };

export interface TweakOption {
  label: string;
  value: TweakValue;
}

export interface TweakDefinition {
  id: string;
  /** The section it appears under. Only the baseline Typography group is fixed. */
  group: string;
  label: string;
  cssVariable: `--${string}`;
  control: TweakControl;
  defaultValue: TweakValue;
}

export interface TweakManifest {
  schemaVersion: number;
  /** The revision this manifest describes. A manifest never outlives its code. */
  variantRevisionId: string;
  controls: TweakDefinition[];
}

/** A definition that did not survive validation, and why, in the user's words. */
export interface DroppedTweak {
  label: string;
  reason: string;
}

/** The user's changes. Defaults live in the manifest and are never copied here. */
export type TweakOverrides = Record<string, TweakValue>;

/**
 * One editing session, checkpointed so it can be recovered (spec §6.5).
 *
 * A checkpoint is the whole override set, not a diff: it is a few hundred bytes,
 * and restoring one has to work when the manifest in between has changed.
 */
export interface TweakCheckpoint {
  id: string;
  at: number;
  overrides: TweakOverrides;
}

/**
 * The file a manifest lives in, inside the revision directory. Kept out of the
 * record because the record is read and rewritten under a lock on every variant
 * transition, and a manifest is the one part of a revision that is bulky and
 * immutable.
 */
export const TWEAK_MANIFEST_FILE = 'tweaks.json';

export const CSS_VARIABLE_PATTERN = /^--[A-Za-z0-9_-]+$/;

/**
 * What the preview will accept as a value. The same rule the harness applies
 * inside the frame, stated once here so the two cannot drift: no statement
 * terminators, no braces, no brackets, no quotes, nothing that could close a
 * declaration and start something else.
 */
export const TWEAK_VALUE_PATTERN = /^[^;{}()<>"'\\]{1,128}$/;

export function isTweakValue(value: unknown): value is TweakValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** The string that reaches the page: a range carries its unit, the rest do not. */
export function tweakValueToCss(control: TweakControl, value: TweakValue): string {
  return control.type === 'range' && typeof value === 'number'
    ? `${roundToStep(value, control.step)}${control.unit ?? ''}`
    : String(value);
}

/**
 * Round to the control's own step, so a drag never produces `13.000000000000002px`.
 * The step's own precision decides the result's: a step of `0.05` keeps two
 * decimals, a step of `1` keeps none.
 */
function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * Coerce an incoming value onto a control, or null when it does not belong to it.
 *
 * Called on the way in from the UI *and* again in the runtime. The UI cannot be
 * the authority: values arrive through the request log, which is a file, and a
 * value the control does not define would otherwise be stored and then sent to
 * the page.
 */
export function normalizeTweakValue(control: TweakControl, value: unknown): TweakValue | null {
  switch (control.type) {
    case 'range': {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return null;
      // Clamped rather than refused: a slider dragged to its end can land a hair
      // outside the range through floating-point arithmetic, and refusing that
      // would make the control stick short of its own maximum.
      return roundToStep(Math.min(control.max, Math.max(control.min, numeric)), control.step);
    }
    case 'toggle': {
      if (value === control.onValue) return control.onValue;
      if (value === control.offValue) return control.offValue;
      // A bare boolean is what a switch naturally produces.
      if (value === true) return control.onValue;
      if (value === false) return control.offValue;
      return null;
    }
    case 'choice': {
      const match = control.options.find((option) => option.value === value);
      return match === undefined ? null : match.value;
    }
    case 'colour': {
      if (typeof value !== 'string') return null;
      const colour = value.trim();
      return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(colour) ? colour : null;
    }
  }
}

/** The value in force for one control: the user's override, else the default. */
export function effectiveTweakValue(
  definition: TweakDefinition,
  overrides: TweakOverrides,
): TweakValue {
  const override = overrides[definition.id];
  if (override === undefined) return definition.defaultValue;
  return normalizeTweakValue(definition.control, override) ?? definition.defaultValue;
}

/** Overrides that still name a control this manifest declares. */
export function pruneOverrides(
  manifest: TweakManifest,
  overrides: TweakOverrides,
): TweakOverrides {
  const kept: TweakOverrides = {};
  for (const definition of manifest.controls) {
    const value = overrides[definition.id];
    if (value === undefined) continue;
    const normalized = normalizeTweakValue(definition.control, value);
    if (normalized !== null) kept[definition.id] = normalized;
  }
  return kept;
}

export function editedTweakCount(manifest: TweakManifest, overrides: TweakOverrides): number {
  return manifest.controls.filter((definition) => {
    const override = overrides[definition.id];
    return override !== undefined && override !== definition.defaultValue;
  }).length;
}

/**
 * The effective custom properties as a scoped block — Copy CSS (spec §6.5).
 *
 * Every control is included, not only the edited ones. The block is meant to be
 * pasted into the page's own stylesheet, where the omitted ones would silently
 * fall back to whatever the page already had; a partial block would apply
 * correctly today and stop matching the moment the page is regenerated.
 */
export function tweakCssBlock(manifest: TweakManifest, overrides: TweakOverrides): string {
  const lines = manifest.controls.map((definition) => {
    const value = effectiveTweakValue(definition, overrides);
    return `  ${definition.cssVariable}: ${tweakValueToCss(definition.control, value)};`;
  });
  return lines.length === 0 ? '' : `:root {\n${lines.join('\n')}\n}`;
}

/** Group order follows the manifest, so it reads as the model laid it out. */
export function groupTweaks(controls: TweakDefinition[]): Array<{
  group: string;
  controls: TweakDefinition[];
}> {
  const groups: Array<{ group: string; controls: TweakDefinition[] }> = [];
  for (const definition of controls) {
    const existing = groups.find((entry) => entry.group === definition.group);
    if (existing) existing.controls.push(definition);
    else groups.push({ group: definition.group, controls: [definition] });
  }
  return groups;
}

export const EMPTY_MANIFEST: TweakManifest = {
  schemaVersion: TWEAK_SCHEMA_VERSION,
  variantRevisionId: '',
  controls: [],
};

/**
 * What is actually written to `tweaks.json`: the manifest, and what validation
 * removed from it.
 *
 * The drops travel with the manifest rather than in the record because they are
 * a property of this revision's declaration and are read at exactly the moment
 * the panel renders it — and because the record is rewritten under a lock on
 * every variant transition, which is no place for a list that never changes.
 */
export interface TweakManifestDocument {
  manifest: TweakManifest;
  dropped: DroppedTweak[];
}

export const EMPTY_MANIFEST_DOCUMENT: TweakManifestDocument = {
  manifest: EMPTY_MANIFEST,
  dropped: [],
};

export function normalizeTweakDocument(value: unknown): TweakManifestDocument {
  if (!isRecord(value)) return EMPTY_MANIFEST_DOCUMENT;
  const dropped = Array.isArray(value.dropped)
    ? value.dropped.flatMap((entry) =>
        isRecord(entry) && typeof entry.label === 'string' && typeof entry.reason === 'string'
          ? [{ label: entry.label, reason: entry.reason }]
          : [],
      )
    : [];
  return { manifest: normalizeTweakManifest(value.manifest), dropped };
}

/** Overrides as stored: unknown shapes are dropped rather than trusted. */
export function normalizeTweakOverrides(value: unknown): TweakOverrides {
  if (!isRecord(value)) return {};
  const overrides: TweakOverrides = {};
  for (const [id, entry] of Object.entries(value)) {
    if (isTweakValue(entry)) overrides[id] = entry;
  }
  return overrides;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Read a manifest back from disk. A manifest written by a newer schema, or
 * damaged, becomes an empty one: the page still renders and the panel says it has
 * no controls, which is true and recoverable by revising.
 */
export function normalizeTweakManifest(value: unknown): TweakManifest {
  if (!isRecord(value) || !Array.isArray(value.controls)) return EMPTY_MANIFEST;
  const schemaVersion =
    typeof value.schemaVersion === 'number' ? value.schemaVersion : TWEAK_SCHEMA_VERSION;
  const controls = value.controls.flatMap((entry) => {
    const definition = normalizeTweakDefinition(entry);
    if (definition === null) return [];
    return [schemaVersion >= 2 ? withStandardFontOptions(definition) : definition];
  });
  return {
    schemaVersion,
    variantRevisionId:
      typeof value.variantRevisionId === 'string' ? value.variantRevisionId : '',
    controls: controls.slice(0, MAX_TWEAK_CONTROLS),
  };
}

/** Migrate old two-option font controls and ignore model-authored font catalogs. */
function withStandardFontOptions(definition: TweakDefinition): TweakDefinition {
  const isHeadingFont = definition.id === 'font' && definition.cssVariable === '--font-family';
  const isBodyFont = definition.id === 'body-font' && definition.cssVariable === '--body-font';
  if (!isHeadingFont && !isBodyFont) return definition;
  if (definition.control.type !== 'choice') return definition;
  const options = DESIGN_FONT_OPTIONS.map(({ label, value }) => ({ label, value }));
  const defaultValue = options.some((option) => option.value === definition.defaultValue)
    ? definition.defaultValue
    : options[0]!.value;
  return { ...definition, control: { type: 'choice', options }, defaultValue };
}

/**
 * Shape validation only — whether a definition is well-formed. Whether it does
 * anything to the page is `validateTweakControls`, which needs the page.
 */
export function normalizeTweakDefinition(value: unknown): TweakDefinition | null {
  if (!isRecord(value)) return null;
  const { id, group, label, cssVariable } = value;
  if (typeof id !== 'string' || id.trim() === '') return null;
  if (typeof cssVariable !== 'string' || !CSS_VARIABLE_PATTERN.test(cssVariable)) return null;

  const control = normalizeTweakControl(value.control);
  if (control === null) return null;

  const defaultValue = normalizeTweakValue(control, value.defaultValue);
  if (defaultValue === null) return null;

  return {
    id: id.trim().slice(0, 64),
    group: typeof group === 'string' && group.trim() !== '' ? group.trim().slice(0, 48) : 'Design',
    label: typeof label === 'string' && label.trim() !== '' ? label.trim().slice(0, 64) : id,
    cssVariable: cssVariable as `--${string}`,
    control,
    defaultValue,
  };
}

/**
 * Will the preview accept what this value becomes?
 *
 * The frame refuses anything that could close a declaration, and it does so
 * silently — as a sandbox should. A control the manifest keeps but the frame
 * refuses is the worst of both: it renders, it moves, it persists, and the page
 * never changes. So a value that would be refused there disqualifies the control
 * here, where there is still something to say about it.
 */
function previewAccepts(value: TweakValue): boolean {
  return TWEAK_VALUE_PATTERN.test(String(value));
}

export function normalizeTweakControl(value: unknown): TweakControl | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'range': {
      const { min, max, step } = value;
      if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min)) return null;
      if (!Number.isFinite(max) || max <= min) return null;
      const size = typeof step === 'number' && step > 0 ? step : (max - min) / 100;
      const unit =
        typeof value.unit === 'string' && value.unit.trim() !== ''
          ? value.unit.trim().slice(0, 8)
          : undefined;
      // Dropped rather than stripped: without its unit the same number means a
      // different size, so a slider that silently lost `rem` is not a repair.
      if (unit !== undefined && !previewAccepts(unit)) return null;
      return {
        type: 'range',
        min,
        max,
        step: size,
        ...(unit === undefined ? {} : { unit }),
      };
    }
    case 'toggle': {
      const { offValue, onValue } = value;
      if (!isTweakValue(offValue) || !isTweakValue(onValue)) return null;
      if (!previewAccepts(offValue) || !previewAccepts(onValue)) return null;
      // Both sides identical is a switch that does nothing.
      return offValue === onValue ? null : { type: 'toggle', offValue, onValue };
    }
    case 'colour':
      return { type: 'colour' };
    case 'choice': {
      if (!Array.isArray(value.options)) return null;
      const options: TweakOption[] = [];
      for (const entry of value.options) {
        if (!isRecord(entry) || !isTweakValue(entry.value)) continue;
        // One unusable option is not worth losing the control over — the rest
        // still work — but two left standing is the floor for a choice at all.
        if (!previewAccepts(entry.value)) continue;
        if (options.some((option) => option.value === entry.value)) continue;
        options.push({
          label: typeof entry.label === 'string' && entry.label.trim() !== ''
            ? entry.label.trim().slice(0, 32)
            : String(entry.value),
          value: entry.value,
        });
        if (options.length === MAX_TWEAK_OPTIONS) break;
      }
      // One option is not a choice.
      return options.length < 2 ? null : { type: 'choice', options };
    }
    default:
      return null;
  }
}
