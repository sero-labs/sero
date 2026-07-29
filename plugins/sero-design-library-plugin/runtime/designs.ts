import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import type { DesignBrief, DesignRecord, DesignReference, DesignVariant } from '../shared/design';
import {
  DESIGN_SCHEMA_VERSION,
  MAX_REFERENCES,
  MIN_REFERENCES,
  plannedVariantCount,
  visibleRevision,
} from '../shared/design';
import { normalizeDesignBrief } from '../shared/design-normalize';
import { effectiveAnalysis } from '../shared/librarian';
import type { DesignLibraryPaths } from '../shared/paths';
import { isSafeId, revisionDir } from '../shared/paths';
import type { RevisionBehaviour } from '../shared/settings';
import type { ItemRecord } from '../shared/records';
import { variantTarget } from '../shared/records';
import type { ConflictResolution, ReferenceGuardrails } from '../shared/synthesis';
import { applyResolutions, synthesizeGuardrails } from '../shared/synthesis';
import { updateState } from '../shared/state-io';
import {
  createDesignRecord,
  mutateDesign,
  mutateVariant,
  readDesign,
  scanDesigns,
} from './design-store';
import { createJob, markCancelled, requestCancel } from './jobs';
import { stageReferenceAssets } from './reference-assets';
import { readItem, readJob } from './store';

/**
 * Turning references into a Design record (spec §6.1–§6.4).
 *
 * Creation is a gate, not a formality. A Design that cannot say what it was
 * generated from, or that would be generated under guardrails contradicting each
 * other, is refused outright — the alternative is a Design that looks fine and
 * quietly produced work nobody asked for.
 */

export interface DesignCreateInput {
  designId: string;
  title: string;
  brief: DesignBrief;
  /** Ordered; position 0 is primary. */
  referenceItemIds: string[];
  resolutions: ConflictResolution[];
  /** Extra rules for this Design alone, on top of the references' own. */
  sessionRules?: string[];
}

export type DesignCreateOutcome =
  | { status: 'created'; design: DesignRecord }
  | { status: 'refused'; reason: string };

/** Guardrails as the Design will read them, overrides included. */
export function referenceGuardrails(items: ItemRecord[]): ReferenceGuardrails[] {
  return items.map((item, order) => {
    const analysis = effectiveAnalysis(item.profile);
    return { itemId: item.id, order, always: analysis.always, never: analysis.never };
  });
}

/**
 * Why a set of references cannot start a Design, or null when it can.
 *
 * An unanalysed reference is refused rather than skipped: every reference gives
 * the run the Librarian's structured language, including plugin-made images
 * that may also contribute their owned artwork (spec §6.1). A Design that
 * silently ignored one would be lying about its provenance.
 */
export function refuseReferences(items: ItemRecord[]): string | null {
  if (items.length < MIN_REFERENCES) return 'A Design needs at least one reference.';
  if (items.length > MAX_REFERENCES) {
    return `A Design takes at most ${MAX_REFERENCES} references.`;
  }
  const deleted = items.filter((item) => item.deletedAt !== undefined);
  if (deleted.length > 0) {
    return `${deleted.length} of the chosen references are in Trash. Restore them or choose others.`;
  }
  const unanalysed = items.filter((item) => item.analysis.status !== 'ready');
  if (unanalysed.length > 0) {
    return `${unanalysed.length} of the chosen references have not been analysed yet. A Design is generated from the Librarian's reading of a reference, so it cannot use one that has none.`;
  }
  return null;
}

function deriveTitle(title: string, brief: DesignBrief): string {
  const offered = title.trim();
  if (offered !== '') return offered.slice(0, 120);
  const words = brief.request.trim().split(/\s+/).filter((word) => word !== '');
  return words.length === 0 ? 'Untitled design' : words.slice(0, 6).join(' ').slice(0, 120);
}

/**
 * The variants a Design starts with. `per-reference` binds each variant to the
 * reference it draws on; `blend` leaves it unset, because every variant draws on
 * all of them.
 */
export function planVariants(brief: DesignBrief, references: DesignReference[]): DesignVariant[] {
  const count = plannedVariantCount(brief, references.length);
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    index,
    status: 'pending' as const,
    attempts: 0,
    revisions: [],
    ...(brief.variationMode === 'per-reference' && references[index]
      ? { referenceItemId: references[index].itemId }
      : {}),
  }));
}

export async function createDesign(
  paths: DesignLibraryPaths,
  input: DesignCreateInput,
): Promise<DesignCreateOutcome> {
  if (!isSafeId(input.designId)) return { status: 'refused', reason: 'Unusable design id.' };

  // Checked before anything else, because a replayed request must be a no-op
  // rather than a refusal: by the time it replays, a reference may have been
  // deleted, and reporting that would bury the fact that the Design already
  // exists and is fine.
  const existing = await readDesign(paths, input.designId);
  if (existing) return { status: 'created', design: existing };

  // Duplicate ids are unique per reference, so a repeated id in the list is a
  // caller mistake rather than an intentional double weighting.
  const ids = [...new Set(input.referenceItemIds)];
  const records = await Promise.all(ids.map((itemId) => readItem(paths, itemId)));
  const missing = ids.filter((_, index) => records[index] === null);
  if (missing.length > 0) {
    return { status: 'refused', reason: `No Library item ${missing.join(', ')}.` };
  }
  const items = records.filter((record): record is ItemRecord => record !== null);

  const refusal = refuseReferences(items);
  if (refusal) return { status: 'refused', reason: refusal };

  // Synthesis is re-derived here from the records rather than taken from the
  // caller. The dialog's view of the conflicts may be minutes old, and a
  // reference's guardrails are editable in the meantime.
  const synthesis = synthesizeGuardrails(referenceGuardrails(items));
  const appliedGuardrails = applyResolutions(
    synthesis,
    input.resolutions,
    input.sessionRules ?? [],
  );
  if (!appliedGuardrails) {
    const unresolved = synthesis.conflicts.map((conflict) => conflict.rule).join('; ');
    return {
      status: 'refused',
      reason: `Guardrail conflicts must be resolved before generation starts: ${unresolved}`,
    };
  }

  const brief = normalizeDesignBrief(input.brief);
  if (brief.request.trim() === '') {
    return { status: 'refused', reason: 'A Design needs a request describing what to create.' };
  }

  const references: DesignReference[] = items.map((item, order) => ({ itemId: item.id, order }));
  const assets = await stageReferenceAssets(paths, input.designId, items);
  const now = Date.now();
  const design: DesignRecord = {
    id: input.designId,
    schemaVersion: DESIGN_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    title: deriveTitle(input.title, brief),
    brief,
    references,
    variants: planVariants(brief, references),
    appliedGuardrails,
    assets,
  };

  // Create-if-absent rather than save: two requests carrying the same id must
  // converge on one record, whichever of them the runtime applies second.
  const stored = await createDesignRecord(paths, design);
  return { status: 'created', design: stored.design };
}

export async function renameDesign(
  paths: DesignLibraryPaths,
  designId: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim();
  if (trimmed === '') return;
  await mutateDesign(paths, designId, (design) => ({ ...design, title: trimmed.slice(0, 120) }));
}

export async function deleteDesign(paths: DesignLibraryPaths, designId: string): Promise<void> {
  await mutateDesign(paths, designId, (design) => ({ ...design, deletedAt: Date.now() }));
  // A Design in Trash must not stay on screen; leaving it selected would show a
  // surface for something the Library no longer lists.
  await updateState(paths, (current) =>
    current.view.selectedDesignId === designId
      ? {
          ...current,
          view: { ...current.view, selectedDesignId: undefined, activeVariantId: undefined },
        }
      : null,
  );
}

export async function restoreDesign(paths: DesignLibraryPaths, designId: string): Promise<void> {
  await mutateDesign(paths, designId, (design) => ({ ...design, deletedAt: undefined }));
}

/** Variant statuses that mean the work is over and cancelling is a no-op. */
const SETTLED: readonly DesignVariant['status'][] = ['ready', 'failed', 'cancelled'];

/**
 * Mark a variant cancelled. Its siblings are untouched: a cancellation takes one
 * variant out, never the Design (spec §6.4).
 */
export async function cancelVariant(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
): Promise<void> {
  await mutateVariant(paths, designId, variantId, (variant) =>
    SETTLED.includes(variant.status)
      ? null
      : { ...variant, status: 'cancelled', completedAt: Date.now() },
  );
}

/** Variant statuses a retry is allowed to start from. */
const RETRYABLE: readonly DesignVariant['status'][] = ['failed', 'cancelled'];

/**
 * Give one variant a job and hand back its id for the queue.
 *
 * The job is created before the variant claims it, because the two are separate
 * files and only that order is recoverable: a variant pointing at a job that does
 * not exist has nothing to run and nothing to repair it, while a job no variant
 * claims is cancelled the moment it starts. Returns null when the variant has
 * moved on in the meantime.
 */
export async function startVariant(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  allowedFrom: readonly DesignVariant['status'][] = ['pending'],
  requestId?: number,
): Promise<string | null> {
  const job = await createJob(paths, 'generate', variantTarget(designId, variantId));
  let claimed = false;
  await mutateVariant(paths, designId, variantId, (variant) => {
    if (!allowedFrom.includes(variant.status)) return null;
    // A request the variant has already acted on is a replay, not a second ask.
    // Status alone cannot tell them apart — a retry that has already failed
    // looks exactly like one that was never started — and starting again would
    // spend another model run on work that was done.
    if (requestId !== undefined && (variant.appliedRequestId ?? 0) >= requestId) return null;
    claimed = true;
    // Revisions are kept: a retry is another attempt at the same variant, and
    // whatever an earlier attempt produced stays in its history.
    return {
      ...variant,
      status: 'pending',
      error: undefined,
      jobId: job.id,
      ...(requestId === undefined ? {} : { appliedRequestId: requestId }),
    };
  });
  if (!claimed) {
    await markCancelled(paths, job.id);
    return null;
  }
  return job.id;
}

export async function retryVariant(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  requestId?: number,
): Promise<string | null> {
  return startVariant(paths, designId, variantId, RETRYABLE, requestId);
}

/**
 * Ask for a revise (spec §6.4): another run on this variant, starting from what
 * is on screen and carrying an instruction.
 *
 * The instruction is written to the variant before the job is started, so it is
 * durable: the request that carried it is consumed as soon as it is applied, and
 * a run that reached the model without it would quietly regenerate the page from
 * the original brief instead of changing it.
 *
 * Allowed from any settled status. A variant that failed still has the revision
 * that worked before it, and asking for a change to that is a reasonable thing to
 * do; the run simply starts from the revision named here.
 */
export async function reviseVariant(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  instruction: string,
  behaviour: RevisionBehaviour,
  requestId?: number,
): Promise<string | null> {
  const trimmed = instruction.trim();
  if (trimmed === '') return null;

  let armed = false;
  await mutateVariant(paths, designId, variantId, (variant) => {
    if (!SETTLED.includes(variant.status)) return null;
    if (requestId !== undefined && (variant.appliedRequestId ?? 0) >= requestId) return null;
    const base = visibleRevision(variant);
    if (!base) return null;
    armed = true;
    return {
      ...variant,
      pendingRevision: { instruction: trimmed, behaviour, baseRevisionId: base.id },
    };
  });
  if (!armed) return null;

  const jobId = await startVariant(paths, designId, variantId, SETTLED, requestId);
  // The instruction is dropped again if no job could claim the variant, so a
  // later retry does not silently inherit a revise nobody asked it for.
  if (jobId === null) {
    await mutateVariant(paths, designId, variantId, (variant) =>
      variant.pendingRevision === undefined
        ? null
        : { ...variant, pendingRevision: undefined },
    );
  }
  return jobId;
}

/** Put a different revision on screen. Nothing is generated and nothing is lost. */
export async function setVisibleRevision(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  revisionId: string,
): Promise<void> {
  await mutateVariant(paths, designId, variantId, (variant) =>
    variant.revisions.some((revision) => revision.id === revisionId)
      ? { ...variant, visibleRevisionId: revisionId }
      : null,
  );
}

/**
 * Delete one revision for good (spec §6.4: revisions persist until manually
 * deleted).
 *
 * The record entry goes first and the directory second. The other order would
 * leave a revision the selector offers and nothing can render; this order leaves
 * a directory nothing points at, which the startup sweep already collects.
 */
export async function deleteRevision(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  revisionId: string,
): Promise<void> {
  let removed = false;
  await mutateVariant(paths, designId, variantId, (variant) => {
    // A revise reads its base off disk when it runs, so deleting that revision
    // out from under a queued or running one would either fail the run or —
    // once the record no longer names it — drop the instruction and regenerate
    // from the brief. Refused under the record lock, where the check holds.
    if (variant.pendingRevision?.baseRevisionId === revisionId) return null;
    const remaining = variant.revisions.filter((revision) => revision.id !== revisionId);
    // The last one is kept: a variant marked ready with no revision has nothing
    // to show and no way back to having one except regenerating.
    if (remaining.length === variant.revisions.length || remaining.length === 0) return null;
    removed = true;
    const visible =
      variant.visibleRevisionId === revisionId
        ? remaining[remaining.length - 1]?.id
        : variant.visibleRevisionId;
    return { ...variant, revisions: remaining, visibleRevisionId: visible };
  });
  if (removed) {
    await rm(revisionDir(paths, designId, variantId, revisionId), { recursive: true, force: true });
  }
}

/**
 * Statuses that mean work is owed. Either is a stuck spinner once no live job
 * holds the variant: `pending` when the process died between saving the record
 * and creating the jobs, `running` when the job that owned it is gone —
 * reconciliation repairs a variant whose job it can still read, and finished job
 * records are swept after a day, so a machine left closed longer than that comes
 * back to a variant nothing else would ever look at again.
 */
const UNSTARTED: readonly DesignVariant['status'][] = ['pending', 'running'];

/**
 * Jobs for every variant of a Design that is waiting and has nobody running it.
 *
 * Called after creating a Design and again at startup — at startup only after
 * reconciliation, which is what makes reading `running` as abandoned safe: a run
 * this process owns has not started yet.
 */
export async function startPendingVariants(
  paths: DesignLibraryPaths,
  designId: string,
): Promise<string[]> {
  const design = await readDesign(paths, designId);
  if (!design || design.deletedAt !== undefined) return [];

  const started: string[] = [];
  for (const variant of design.variants) {
    if (!UNSTARTED.includes(variant.status)) continue;
    if (await hasLiveJob(paths, variant.jobId)) continue;
    const jobId = await startVariant(paths, designId, variant.id, UNSTARTED);
    if (jobId !== null) started.push(jobId);
  }
  return started;
}

/** The same sweep across every Design, for startup. */
export async function resumePendingVariants(paths: DesignLibraryPaths): Promise<string[]> {
  const { designs } = await scanDesigns(paths);
  const started: string[] = [];
  for (const design of designs) {
    if (design.deletedAt !== undefined) continue;
    started.push(...(await startPendingVariants(paths, design.id)));
  }
  return started;
}

async function hasLiveJob(paths: DesignLibraryPaths, jobId: string | undefined): Promise<boolean> {
  if (jobId === undefined) return false;
  const job = await readJob(paths, jobId);
  return job?.status === 'queued' || job?.status === 'running';
}

/** Ask every unfinished variant of a Design to stop, and name their jobs. */
export async function cancelDesignWork(
  paths: DesignLibraryPaths,
  designId: string,
): Promise<string[]> {
  const design = await readDesign(paths, designId);
  if (!design) return [];
  const jobIds: string[] = [];
  for (const variant of design.variants) {
    if (SETTLED.includes(variant.status) || variant.jobId === undefined) continue;
    await requestCancel(paths, variant.jobId);
    jobIds.push(variant.jobId);
  }
  return jobIds;
}
