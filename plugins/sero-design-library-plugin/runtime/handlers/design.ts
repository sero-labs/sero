/**
 * Design and Tweaks request handlers.
 *
 * Revision history is never destroyed: replacing a visible result moves the
 * pointer, and a tweak editing session becomes exactly one recoverable
 * revision at a checkpoint boundary rather than one revision per slider event.
 */

import { designRecordPath, itemRecordPath } from '../../shared/paths';
import { mutateRecord, readRecord } from '../../shared/state-io';
import { newId } from '../../shared/ids';
import { createOrderedReferences } from '../../shared/schemas';
import { normaliseTweakValue, pruneTweakOverrides } from '../../shared/tweaks';
import type {
  DesignRecord,
  DesignVariantRecord,
  GuardrailConflict,
  LibraryItemRecord,
  VariantRevisionRecord,
} from '../../shared/records';
import type { EditableLibrarianProfile, OutputTarget, RevisionBehaviour } from '../../shared/types';
import type { TweakCheckpointReason, TweakValue } from '../../shared/tweak-types';
import { resolveLibrarianField } from '../../shared/schemas';
import type { RuntimeHost } from '../host';

export async function loadReferenceProfiles(
  host: RuntimeHost,
  design: DesignRecord,
): Promise<EditableLibrarianProfile[]> {
  const profiles: EditableLibrarianProfile[] = [];
  for (const reference of design.references) {
    if (reference.source.kind !== 'live') continue;
    const item = await readRecord<LibraryItemRecord>(
      itemRecordPath(host.paths, reference.source.itemId),
    );
    if (item?.profile) profiles.push(item.profile);
  }
  return profiles;
}

/**
 * Only genuinely incompatible guardrails block generation: an Always on one
 * reference that another reference states as a Never. Everything else is a
 * style difference the model is allowed to blend.
 */
export function findGuardrailConflicts(
  references: Array<{ itemId: string; always: string[]; never: string[] }>,
): GuardrailConflict[] {
  const conflicts: GuardrailConflict[] = [];
  const normalise = (value: string) => value.trim().toLowerCase();

  for (const source of references) {
    for (const always of source.always) {
      for (const other of references) {
        if (other.itemId === source.itemId) continue;
        const match = other.never.find((never) => normalise(never) === normalise(always));
        if (!match) continue;
        const duplicate = conflicts.some(
          (conflict) => normalise(conflict.always) === normalise(always)
            && conflict.primaryItemId === source.itemId
            && conflict.conflictingItemId === other.itemId,
        );
        if (!duplicate) {
          conflicts.push({
            always,
            never: match,
            primaryItemId: source.itemId,
            conflictingItemId: other.itemId,
          });
        }
      }
    }
  }
  return conflicts;
}

export async function createDesign(
  host: RuntimeHost,
  payload: {
    designId: string;
    title: string;
    request: string;
    outputTarget: OutputTarget;
    itemIds: string[];
  },
): Promise<void> {
  const references = createOrderedReferences(
    payload.itemIds.map((itemId) => ({ kind: 'live' as const, itemId })),
  );

  const guardrails: Array<{ itemId: string; always: string[]; never: string[] }> = [];
  for (const itemId of payload.itemIds) {
    const item = await readRecord<LibraryItemRecord>(itemRecordPath(host.paths, itemId));
    if (!item?.profile) continue;
    guardrails.push({
      itemId,
      always: resolveLibrarianField(item.profile, 'always'),
      never: resolveLibrarianField(item.profile, 'never'),
    });
  }

  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), () => ({
    revision: 0,
    id: payload.designId,
    title: payload.title,
    request: payload.request,
    outputTarget: payload.outputTarget,
    references,
    variants: [],
    assets: [],
    conflicts: findGuardrailConflicts(guardrails),
    createdAt: host.now(),
    updatedAt: host.now(),
  }));
}

export function unresolvedConflicts(design: DesignRecord): GuardrailConflict[] {
  return design.conflicts.filter((conflict) => conflict.resolvedAt === undefined);
}

export async function resolveConflict(
  host: RuntimeHost,
  payload: { designId: string; always: string; never: string; resolution: 'keep-always' | 'keep-never' },
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${payload.designId}.`);
    return {
      ...current,
      conflicts: current.conflicts.map((conflict) =>
        conflict.always === payload.always && conflict.never === payload.never
          ? { ...conflict, resolvedAt: host.now(), resolution: payload.resolution }
          : conflict),
      updatedAt: host.now(),
    };
  });
}

/** Add or replace a variant slot before its job starts. */
export async function upsertVariant(
  host: RuntimeHost,
  designId: string,
  variant: DesignVariantRecord,
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${designId}.`);
    const existing = current.variants.findIndex((entry) => entry.id === variant.id);
    const variants = existing === -1
      ? [...current.variants, variant]
      : current.variants.map((entry) => (entry.id === variant.id ? { ...entry, ...variant } : entry));
    return { ...current, variants, updatedAt: host.now() };
  });
}

export async function setVariantTitle(
  host: RuntimeHost,
  designId: string,
  variantId: string,
  title: string,
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${designId}.`);
    return {
      ...current,
      variants: current.variants.map((variant) =>
        variant.id === variantId ? { ...variant, title } : variant),
      updatedAt: host.now(),
    };
  });
}

export async function setVariantStatus(
  host: RuntimeHost,
  designId: string,
  variantId: string,
  status: DesignVariantRecord['status'],
  errorMessage?: string,
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${designId}.`);
    return {
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== variantId) return variant;
        const next = { ...variant, status };
        if (errorMessage === undefined) delete next.errorMessage;
        else next.errorMessage = errorMessage;
        return next;
      }),
      updatedAt: host.now(),
    };
  });
}

/**
 * Attach a completed revision.
 *
 * `retain` keeps the previous result visible alongside the new one by leaving
 * the pointer where it is; `replace` moves the pointer. Neither deletes
 * anything, so both remain fully recoverable.
 */
export async function attachRevision(
  host: RuntimeHost,
  designId: string,
  variantId: string,
  revision: VariantRevisionRecord,
  behaviour: RevisionBehaviour = 'replace',
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${designId}.`);
    return {
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== variantId) return variant;
        const numbered = { ...revision, revisionNumber: variant.revisions.length + 1 };
        const replace = behaviour === 'replace' || variant.visibleRevisionId === undefined;
        return {
          ...variant,
          status: 'succeeded' as const,
          revisions: [...variant.revisions, numbered],
          visibleRevisionId: replace ? numbered.id : variant.visibleRevisionId,
        };
      }),
      updatedAt: host.now(),
    };
  });
}

function visibleRevisionOf(variant: DesignVariantRecord): VariantRevisionRecord | undefined {
  return variant.revisions.find((entry) => entry.id === variant.visibleRevisionId);
}

/** Autosave tweak edits as working state — no revision is created here. */
export async function updateTweaks(
  host: RuntimeHost,
  payload: { designId: string; variantId: string; overrides: Record<string, TweakValue> },
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${payload.designId}.`);
    return {
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== payload.variantId) return variant;
        const revision = visibleRevisionOf(variant);
        if (!revision) return variant;

        const accepted: Record<string, TweakValue> = {};
        for (const [id, value] of Object.entries(payload.overrides)) {
          const definition = revision.tweakManifest.controls.find((control) => control.id === id);
          if (!definition) continue;
          const normalised = normaliseTweakValue(definition.control, value);
          if (normalised !== null) accepted[id] = normalised;
        }

        return {
          ...variant,
          tweakWorking: {
            variantRevisionId: revision.id,
            overrides: { ...(variant.tweakWorking?.overrides ?? revision.tweakOverrides), ...accepted },
            updatedAt: host.now(),
            dirty: true,
          },
        };
      }),
      updatedAt: host.now(),
    };
  });
}

export async function resetTweaks(
  host: RuntimeHost,
  payload: { designId: string; variantId: string; controlId?: string },
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${payload.designId}.`);
    return {
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== payload.variantId) return variant;
        const revision = visibleRevisionOf(variant);
        if (!revision) return variant;
        const base = { ...(variant.tweakWorking?.overrides ?? revision.tweakOverrides) };
        if (payload.controlId) delete base[payload.controlId];
        return {
          ...variant,
          tweakWorking: {
            variantRevisionId: revision.id,
            overrides: payload.controlId ? base : {},
            updatedAt: host.now(),
            dirty: true,
          },
        };
      }),
      updatedAt: host.now(),
    };
  });
}

/**
 * Turn one editing session into one recoverable revision. A checkpoint with no
 * dirty working state is a no-op, so repeated boundaries cannot create empty
 * revisions.
 */
export async function checkpointTweaks(
  host: RuntimeHost,
  payload: { designId: string; variantId: string; reason: TweakCheckpointReason },
): Promise<boolean> {
  let created = false;

  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${payload.designId}.`);
    return {
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== payload.variantId) return variant;
        const revision = visibleRevisionOf(variant);
        const working = variant.tweakWorking;
        if (!revision || !working?.dirty) return variant;

        const overrides = pruneTweakOverrides(revision.tweakManifest, working.overrides);
        const unchanged = JSON.stringify(overrides) === JSON.stringify(revision.tweakOverrides);
        if (unchanged) {
          const cleared = { ...variant };
          delete cleared.tweakWorking;
          return cleared;
        }

        created = true;
        const checkpoint: VariantRevisionRecord = {
          ...revision,
          id: newId('rev', host.now()),
          revisionNumber: variant.revisions.length + 1,
          tweakOverrides: overrides,
          createdAt: host.now(),
          createdReason: 'tweak-checkpoint',
        };
        const next = {
          ...variant,
          revisions: [...variant.revisions, checkpoint],
          visibleRevisionId: checkpoint.id,
        };
        delete next.tweakWorking;
        return next;
      }),
      updatedAt: host.now(),
    };
  });

  return created;
}

/** Effective overrides for a variant — working state wins over the saved revision. */
export function effectiveOverrides(variant: DesignVariantRecord): Record<string, TweakValue> {
  const revision = visibleRevisionOf(variant);
  if (!revision) return {};
  return { ...revision.tweakOverrides, ...(variant.tweakWorking?.overrides ?? {}) };
}

export async function setDesignDeleted(
  host: RuntimeHost,
  designId: string,
  deleted: boolean,
): Promise<void> {
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${designId}.`);
    const next = { ...current, updatedAt: host.now() };
    if (deleted) return { ...next, deletedAt: host.now() };
    delete next.deletedAt;
    return next;
  });
}
