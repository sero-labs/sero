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
  PendingRevision,
  ResolvedConflict,
  VariantStatus,
  VariationMode,
} from './design';
import {
  DEFAULT_VARIANTS,
  DESIGN_SCHEMA_VERSION,
  MAX_REFERENCES,
  MAX_TWEAK_CHECKPOINTS,
  MAX_VARIANTS,
  MIN_VARIANTS,
} from './design';
import { isSafeId } from './paths';
import type { RevisionTweakState } from './design';
import type { TweakCheckpoint } from './tweaks';
import { normalizeTweakOverrides } from './tweaks';

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

function normalizeCheckpoint(value: unknown): TweakCheckpoint | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return null;
  return { id: value.id, at: num(value.at, 0), overrides: normalizeTweakOverrides(value.overrides) };
}

/**
 * Tweak state, or undefined when the revision has none. An absent state and an
 * empty one mean the same thing, so the empty case is dropped rather than
 * written back — it keeps an untouched revision's record identical to the one the
 * generation run wrote.
 */
function normalizeTweakState(value: unknown): RevisionTweakState | undefined {
  if (!isRecordObject(value)) return undefined;
  const overrides = normalizeTweakOverrides(value.overrides);
  const checkpoints = Array.isArray(value.checkpoints)
    ? value.checkpoints
        .flatMap((entry) => {
          const checkpoint = normalizeCheckpoint(entry);
          return checkpoint === null ? [] : [checkpoint];
        })
        .slice(-MAX_TWEAK_CHECKPOINTS)
    : [];
  if (Object.keys(overrides).length === 0 && checkpoints.length === 0) return undefined;
  return { overrides, checkpoints };
}

function normalizeRevision(value: unknown): DesignRevision | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return null;
  // The id names the revision's directory. One carrying a separator or a
  // traversal segment would not merely be odd — every path built from it would
  // point outside the record.
  if (!isSafeId(value.id)) return null;

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

  const tweaks = normalizeTweakState(value.tweaks);

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
    ...(tweaks === undefined ? {} : { tweaks }),
    ...(typeof value.supersededAt === 'number' ? { supersededAt: value.supersededAt } : {}),
    summary: str(value.summary),
    name: str(value.name),
  };
}

/**
 * A revise that is owed. Dropped when its instruction is empty or the revision
 * it was to start from is gone — either way the run would not be the revise the
 * user asked for, and generating something else in its place is worse than
 * having asked again.
 */
function normalizePendingRevision(
  value: unknown,
  revisions: DesignRevision[],
): PendingRevision | null {
  if (!isRecordObject(value)) return null;
  const instruction = str(value.instruction).trim();
  const baseRevisionId = str(value.baseRevisionId);
  if (instruction === '') return null;
  if (!revisions.some((revision) => revision.id === baseRevisionId)) return null;
  return {
    instruction,
    behaviour: value.behaviour === 'retain' ? 'retain' : 'replace',
    baseRevisionId,
  };
}

function normalizeVariant(value: unknown, fallbackIndex: number): DesignVariant | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return null;
  // Names a directory, exactly as a revision id does.
  if (!isSafeId(value.id)) return null;

  const revisions = Array.isArray(value.revisions)
    ? value.revisions.flatMap((entry) => {
        const revision = normalizeRevision(entry);
        return revision === null ? [] : [revision];
      })
    : [];

  // A pointer at a revision that did not survive validation is worse than no
  // pointer: `visibleRevision` would fall through to the newest anyway, and
  // keeping the dangling id invites a later reader to trust it.
  const pendingRevision = normalizePendingRevision(value.pendingRevision, revisions);

  const visible =
    typeof value.visibleRevisionId === 'string' &&
    revisions.some((revision) => revision.id === value.visibleRevisionId)
      ? { visibleRevisionId: value.visibleRevisionId }
      : {};

  return {
    id: value.id,
    index: num(value.index, fallbackIndex),
    status: variantStatus(value.status),
    // The job id is read back as a file name, so an unsafe one is dropped: the
    // variant then looks unowned, which recovery can repair, rather than
    // throwing from inside a path helper on every sweep.
    ...(typeof value.jobId === 'string' && isSafeId(value.jobId) ? { jobId: value.jobId } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    attempts: num(value.attempts, 0),
    revisions,
    ...visible,
    ...(typeof value.referenceItemId === 'string'
      ? { referenceItemId: value.referenceItemId }
      : {}),
    ...(pendingRevision === null ? {} : { pendingRevision }),
    // Request ids are positive integers counting up. Anything else compares
    // unpredictably against the next one and would either wave a replay through
    // or refuse every future retry.
    ...(typeof value.appliedRequestId === 'number' &&
    Number.isSafeInteger(value.appliedRequestId) &&
    value.appliedRequestId >= 0
      ? { appliedRequestId: value.appliedRequestId }
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
  if (!isRecordObject(value)) return { always: [], never: [], session: [], resolved: [] };
  return {
    always: stringList(value.always),
    never: stringList(value.never),
    session: stringList(value.session),
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
  // The id names the Design's directory, as the variant and revision ids name
  // theirs: unsafe means unreadable, not merely odd.
  if (typeof value.id !== 'string' || !isSafeId(value.id)) return null;

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
