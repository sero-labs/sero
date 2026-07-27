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
  DesignRevisionFile,
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
import { isSafeId } from './paths';

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

function normalizeRevisionFile(value: unknown): DesignRevisionFile | null {
  if (!isRecordObject(value) || typeof value.name !== 'string' || value.name === '') return null;
  // The name is joined onto a directory path, so a separator or a traversal
  // segment makes the entry unusable rather than merely odd.
  if (!isSafeId(value.name)) return null;
  return { name: value.name, bytes: num(value.bytes, 0) };
}

function normalizeRevision(value: unknown): DesignRevision | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return null;

  const files = Array.isArray(value.files)
    ? value.files.flatMap((entry) => {
        const file = normalizeRevisionFile(entry);
        return file === null ? [] : [file];
      })
    : [];
  // A revision with no files is not a revision — nothing can render or be
  // exported from it, and keeping it would put an empty entry in the revision
  // selector.
  if (files.length === 0) return null;

  return {
    id: value.id,
    createdAt: num(value.createdAt, 0),
    jobId: str(value.jobId),
    files,
    ...(typeof value.builtFile === 'string' && isSafeId(value.builtFile)
      ? { builtFile: value.builtFile }
      : {}),
    buildWarnings: stringList(value.buildWarnings),
    ...(typeof value.tweakManifestFile === 'string' && isSafeId(value.tweakManifestFile)
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

/**
 * Coerce a brief to the shape the runtime will act on. Exported because a brief
 * also arrives from a tool caller through the request log, and the request log
 * is a file — anything that can write it reaches the create handler.
 */
export function normalizeDesignBrief(value: unknown): DesignBrief {
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
    brief: normalizeDesignBrief(value.brief),
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
