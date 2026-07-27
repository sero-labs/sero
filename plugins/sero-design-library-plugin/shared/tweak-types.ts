/**
 * Tweaks — the AI-authored, design-specific CSS control contract.
 *
 * A manifest is authored by the model for one variant revision from the page
 * it just generated. The UI renders it through generic primitives, so no
 * page-specific UI code is ever written. The preview only ever receives a
 * declared control id and a schema-valid value.
 */

import type { EntityId, EpochMilliseconds } from './types';

export const TWEAK_SCHEMA_VERSION = 1;

export type TweakValue = string | number | boolean;

export type TweakControl =
  | { type: 'range'; min: number; max: number; step: number; unit?: string }
  | { type: 'toggle'; offValue: TweakValue; onValue: TweakValue }
  | { type: 'colour' }
  | { type: 'choice'; options: Array<{ label: string; value: TweakValue }> };

export type TweakControlType = TweakControl['type'];

export interface TweakDefinition {
  id: string;
  group: string;
  label: string;
  cssVariable: `--${string}`;
  control: TweakControl;
  defaultValue: TweakValue;
}

export interface TweakManifest {
  schemaVersion: number;
  variantRevisionId: EntityId;
  controls: TweakDefinition[];
}

export interface VariantTweakState {
  manifest: TweakManifest;
  overrides: Record<string, TweakValue>;
}

/** A control the validator removed, with the reason shown to the user. */
export interface DroppedTweakControl {
  id: string;
  label: string;
  reason: string;
}

export interface TweakValidationResult {
  manifest: TweakManifest;
  dropped: DroppedTweakControl[];
}

/**
 * Working (unsaved) tweak edits for one panel session. Autosaved continuously;
 * checkpointed into one recoverable revision at a session boundary so a slider
 * drag does not create a revision per event.
 */
export interface TweakWorkingState {
  variantRevisionId: EntityId;
  overrides: Record<string, TweakValue>;
  updatedAt: EpochMilliseconds;
  /** True once a change has been made that no checkpoint has captured yet. */
  dirty: boolean;
}

export type TweakCheckpointReason =
  | 'panel-closed'
  | 'variant-changed'
  | 'revision-started'
  | 'gallery-save'
  | 'shutdown';
