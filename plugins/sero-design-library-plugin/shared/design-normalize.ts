/**
 * Validating Design records read from disk.
 *
 * Same contract as `normalizeItemRecord`: a record written by an earlier
 * version, or left half-written by a crash, resolves to null so the caller can
 * skip it. One unreadable Design costs that Design, not the runtime.
 */

import type {
  AppliedGuardrails,
  DesignBrief,
  DesignRecord,
  DesignReference,
  DesignRevision,
  DesignVariant,
  InspirationStrength,
  OutputTarget,
  ResolvedConflict,
  VariantStatus,
  VariationMode,
} from './design';
import {
  DEFAULT_VARIANTS,
  DESIGN_SCHEMA_VERSION,
  MAX_REFERENCES,
  MAX_VARIANTS,
  MIN_VARIANTS,
} from './design';

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function target(value: unknown): OutputTarget {
  return value === 'html' ? 'html' : 'react';
}

function variationMode(value: unknown): VariationMode {
  return value === 'per-reference' ? 'per-reference' : 'blend';
}

function strength(value: unknown): InspirationStrength {
  return value === 'light' || value === 'strong' ? value : 'balanced';
}

function variantStatus(value: unknown): VariantStatus {
  return value === 'running' || value === 'ready' || value === 'failed' || value === 'cancelled'
    ? value
    : 'pending';
}

function normalizeReference(value: unknown, fallbackOrder: number): DesignReference | null {
  if (!isRecordObject(value) || typeof value.itemId !== 'string' || value.itemId === '') return null;
  const tombstone = value.tombstone;
  return {
    itemId: value.itemId,
    order: num(value.order, fallbackOrder),
    ...(isRecordObject(tombstone) && typeof tombstone.itemId === 'string'
      ? {
          tombstone: {
            itemId: tombstone.itemId,
            title: str(tombstone.title, 'Untitled'),
            ...(typeof tombstone.primaryStyle === 'string'
              ? { primaryStyle: tombstone.primaryStyle }
              : {}),
            deletedAt: num(tombstone.deletedAt, 0),
          },
        }
      : {}),
  };
}

function normalizeRevision(value: unknown): DesignRevision | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return null;
  // A revision with no code is not a revision — it cannot render, and keeping
  // it would put an empty entry in the revision selector.
  if (typeof value.code !== 'string' || value.code === '') return null;
  return {
    id: value.id,
    createdAt: num(value.createdAt, 0),
    code: value.code,
    ...(typeof value.builtFile === 'string' ? { builtFile: value.builtFile } : {}),
    ...(typeof value.tweakManifestFile === 'string'
      ? { tweakManifestFile: value.tweakManifestFile }
      : {}),
    summary: str(value.summary),
  };
}

function normalizeVariant(value: unknown, fallbackIndex: number): DesignVariant | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return null;

  const revisions = Array.isArray(value.revisions)
    ? value.revisions.flatMap((entry) => {
        const revision = normalizeRevision(entry);
        return revision === null ? [] : [revision];
      })
    : [];

  // A pointer at a revision that did not survive validation is worse than no
  // pointer: `visibleRevision` would fall through to the newest anyway, and
  // keeping the dangling id invites a later reader to trust it.
  const visible =
    typeof value.visibleRevisionId === 'string' &&
    revisions.some((revision) => revision.id === value.visibleRevisionId)
      ? { visibleRevisionId: value.visibleRevisionId }
      : {};

  return {
    id: value.id,
    index: num(value.index, fallbackIndex),
    status: variantStatus(value.status),
    ...(typeof value.jobId === 'string' ? { jobId: value.jobId } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    attempts: num(value.attempts, 0),
    revisions,
    ...visible,
    ...(typeof value.referenceItemId === 'string'
      ? { referenceItemId: value.referenceItemId }
      : {}),
    ...(typeof value.startedAt === 'number' ? { startedAt: value.startedAt } : {}),
    ...(typeof value.completedAt === 'number' ? { completedAt: value.completedAt } : {}),
  };
}

function normalizeConflict(value: unknown): ResolvedConflict | null {
  if (!isRecordObject(value) || typeof value.rule !== 'string') return null;
  return {
    rule: value.rule,
    keptFromItemId: str(value.keptFromItemId),
    droppedFromItemIds: stringList(value.droppedFromItemIds),
  };
}

function normalizeGuardrails(value: unknown): AppliedGuardrails {
  if (!isRecordObject(value)) return { always: [], never: [], resolved: [] };
  return {
    always: stringList(value.always),
    never: stringList(value.never),
    resolved: Array.isArray(value.resolved)
      ? value.resolved.flatMap((entry) => {
          const conflict = normalizeConflict(entry);
          return conflict === null ? [] : [conflict];
        })
      : [],
  };
}

function normalizeBrief(value: unknown): DesignBrief {
  const source = isRecordObject(value) ? value : {};
  return {
    request: str(source.request),
    ...(typeof source.recipeId === 'string' ? { recipeId: source.recipeId } : {}),
    target: target(source.target),
    variationMode: variationMode(source.variationMode),
    variantCount: Math.min(MAX_VARIANTS, Math.max(MIN_VARIANTS, num(source.variantCount, DEFAULT_VARIANTS))),
    inspirationStrength: strength(source.inspirationStrength),
  };
}

export function normalizeDesignRecord(value: unknown): DesignRecord | null {
  if (!isRecordObject(value)) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;

  const references = Array.isArray(value.references)
    ? value.references
        .flatMap((entry, index) => {
          const reference = normalizeReference(entry, index);
          return reference === null ? [] : [reference];
        })
        // The cap is a storage invariant, not only a dialog rule: a record
        // naming more references than a Design may have is malformed however
        // it got that way.
        .slice(0, MAX_REFERENCES)
    : [];

  // A Design with no readable reference cannot be regenerated or explained,
  // and its brief alone is not a Design.
  if (references.length === 0) return null;

  return {
    id: value.id,
    schemaVersion: num(value.schemaVersion, DESIGN_SCHEMA_VERSION),
    createdAt: num(value.createdAt, 0),
    updatedAt: num(value.updatedAt, 0),
    title: str(value.title, 'Untitled design'),
    brief: normalizeBrief(value.brief),
    references,
    variants: Array.isArray(value.variants)
      ? value.variants.flatMap((entry, index) => {
          const variant = normalizeVariant(entry, index);
          return variant === null ? [] : [variant];
        })
      : [],
    appliedGuardrails: normalizeGuardrails(value.appliedGuardrails),
    ...(typeof value.deletedAt === 'number' ? { deletedAt: value.deletedAt } : {}),
  };
}
