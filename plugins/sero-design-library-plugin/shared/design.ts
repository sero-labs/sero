/**
 * Design records — a request, the references that inform it, and the variants
 * generated from them (spec §6).
 *
 * A Design is the unit of work; a variant is one attempt at it; a revision is
 * one generated result for that variant. Keeping revisions rather than
 * overwriting is what makes "replace the visible result" recoverable (§6.4) and
 * what lets a tweak manifest stay bound to the exact code it describes — a
 * manifest belongs to a revision, never to a variant, because the controls only
 * make sense for the CSS that revision actually emitted.
 */

import type { DesignAsset } from './media';
import type { TombstonedProvenance } from './records';
import type { RevisionBehaviour } from './settings';
import type { TweakCheckpoint, TweakOverrides } from './tweaks';

export const DESIGN_SCHEMA_VERSION = 1;

/** One target per Design; a Design does not maintain both (spec §6.3). */
export type OutputTarget = 'html' | 'react';

/** `blend` draws on all references at once; `per-reference` gives each its own variant. */
export type VariationMode = 'blend' | 'per-reference';

export type InspirationStrength = 'light' | 'balanced' | 'strong';

export const MIN_REFERENCES = 1;
export const MAX_REFERENCES = 6;
export const MIN_VARIANTS = 1;
export const MAX_VARIANTS = 5;
export const DEFAULT_VARIANTS = 3;

/**
 * A reference as the Design remembers it.
 *
 * `order` is stored rather than implied by array position so a reordering
 * writes one field per entry instead of rewriting the list, and so a corrupt
 * or partially-written list still sorts deterministically. Position 0 is
 * primary and leads the visual direction (§6.1).
 *
 * `tombstone` appears when the Library item has been purged. The Design keeps
 * working — the generated output already exists — and can still say what it
 * was made from.
 */
export interface DesignReference {
  itemId: string;
  order: number;
  tombstone?: TombstonedProvenance;
}

export type VariantStatus = 'pending' | 'running' | 'ready' | 'failed' | 'cancelled';

/**
 * One file the model authored, as stored in the revision directory.
 *
 * A revision is a small file tree, not a single string: the HTML target emits
 * markup, styles and script separately, and the React target may split
 * components. Keeping them as files rather than inline in the record is what
 * stops `record.json` growing to hundreds of kilobytes — it is read and
 * rewritten under a lock on every variant transition.
 */
export interface DesignRevisionFile {
  /** Name inside the revision directory, e.g. `index.html`. Never a path. */
  name: string;
  bytes: number;
}

/**
 * One generated result. Revisions are append-only within a variant: replacing
 * the visible result moves a pointer, it does not destroy what was there.
 */
export interface DesignRevision {
  id: string;
  createdAt: number;
  /** The generation job that produced it. Provenance for the History tab. */
  jobId: string;
  /** Files the model authored, in the order it wrote them. */
  files: DesignRevisionFile[];
  /**
   * The assembled, self-contained preview document inside the revision
   * directory. Present once the build has run; absent means the files exist but
   * nothing renderable was produced.
   */
  builtFile?: string;
  /**
   * What the build refused or dropped — an import outside the approved set, a
   * stylesheet that could not be inlined. Recorded on the revision so the
   * warning survives a restart and is never mistaken for the capability having
   * been allowed (spec §7).
   */
  buildWarnings: string[];
  /** Emitted with the revision and bound to it; see the note at the top. */
  tweakManifestFile?: string;
  /**
   * The user's tweak values for this revision, and the editing sessions already
   * checkpointed.
   *
   * On the record rather than beside the manifest, and deliberately: the values
   * change constantly while the manifest never does, the record is what restart
   * recovery already restores, and keeping them here means the projection stays a
   * pure function of the records — a summary can say how many controls are edited
   * without anything reading a second file.
   */
  tweaks?: RevisionTweakState;
  /**
   * When a later revision replaced this one (spec §6.4).
   *
   * Set only by a revise the user asked to *replace* the visible result. The
   * revision is untouched otherwise — its files stay on disk, it stays listed in
   * History, and it can be made visible again. The mark is the whole difference
   * between replacing a result and keeping both, and it is a label rather than a
   * removal because "replacement is always recoverable" (spec §6.4).
   */
  supersededAt?: number;
  /** What the model said it was going for, for the revision selector. */
  summary: string;
  /**
   * What the run called this design, two or three words. Shown on the variant
   * tab in place of its number, which said nothing about three pages that took
   * deliberately different directions.
   *
   * Lives on the revision, not the variant: a retry is a new revision and a
   * different design, so a name pinned to the variant would outlive the work it
   * described. Empty when the run never named it — the tab falls back to the
   * number.
   */
  name: string;
}

/**
 * Tweak state for one revision (spec §6.5).
 *
 * Only overrides are stored. Defaults live in the manifest, so a revision that
 * declares a new default picks it up rather than being pinned to a copy taken
 * when the first slider moved.
 *
 * `checkpoints` is what makes an editing session recoverable. Continuous
 * autosave writes `overrides` on every change; a checkpoint is appended once per
 * session at the defined moments — the panel closing, the variant changing, a new
 * revision arriving, or shutdown — so dragging a slider fifty times leaves one
 * entry in history rather than fifty.
 */
export interface RevisionTweakState {
  overrides: TweakOverrides;
  checkpoints: TweakCheckpoint[];
}

/** Enough to undo a session's work; past this the older ones say nothing new. */
export const MAX_TWEAK_CHECKPOINTS = 10;

/**
 * A revise the user has asked for but that has not run yet (spec §6.4).
 *
 * Stored on the variant rather than passed to the queue, for the same reason the
 * job is a file: the request that started it is consumed the moment it is
 * applied, and a revise that lost its instruction on the way to the model would
 * regenerate the page from the original brief — silently producing something
 * nobody asked for. Cleared when the run that used it finishes.
 */
export interface PendingRevision {
  instruction: string;
  /** Whether the result replaces the visible revision or joins it. */
  behaviour: RevisionBehaviour;
  /** The revision being revised, so the run starts from what is on screen. */
  baseRevisionId: string;
}

export interface DesignVariant {
  id: string;
  /** 0-based position in the Design, for stable display order. */
  index: number;
  status: VariantStatus;
  /** Short, user-facing description of the latest generation activity. */
  progress?: string;
  /** The persisted job currently responsible for this variant. */
  jobId?: string;
  error?: string;
  attempts: number;
  revisions: DesignRevision[];
  /** Which revision is on screen. Absent until the first one lands. */
  visibleRevisionId?: string;
  /**
   * For `per-reference` mode: the reference this variant was generated from.
   * Absent in `blend` mode, where every variant draws on all of them.
   */
  referenceItemId?: string;
  /** Set when a revise is owed; consumed by the run that carries it out. */
  pendingRevision?: PendingRevision;
  /**
   * The last request id that started work here. The request log is applied
   * at-least-once, so this is what tells a replayed retry from a new one.
   */
  appliedRequestId?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface DesignBrief {
  /** What the user asked for, in their words. */
  request: string;
  /** Id of the prompt recipe applied on top of the request (spec §6.2). */
  recipeId?: string;
  target: OutputTarget;
  variationMode: VariationMode;
  variantCount: number;
  inspirationStrength: InspirationStrength;
}

export interface DesignRecord {
  id: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  title: string;
  brief: DesignBrief;
  references: DesignReference[];
  variants: DesignVariant[];
  /**
   * The guardrails synthesis accepted at creation, frozen here rather than
   * recomputed. Recomputing would let an edit to a reference's guardrails
   * silently change what an already-generated Design claims to have been built
   * under, which is exactly the provenance this is for.
   */
  appliedGuardrails: AppliedGuardrails;
  /**
   * Generated media belonging to this Design (spec §6.6).
   *
   * On the Design rather than on a variant, because that is what "reusable
   * across variants and stays in the tray until deleted" means: an asset
   * outlives the run that asked for it and any variant that failed after it.
   */
  assets: DesignAsset[];
  deletedAt?: number;
}

/** Assets still in the tray — deletion is recoverable, so it hides rather than removes. */
export function liveAssets(design: DesignRecord): DesignAsset[] {
  return design.assets.filter((asset) => asset.deletedAt === undefined);
}

/**
 * The guardrails a Design was generated under, after synthesis across its
 * references (spec §6.1).
 */
export interface AppliedGuardrails {
  always: string[];
  never: string[];
  /**
   * Rules the user added for this Design alone, already merged into `always`.
   * Kept separately so the record can say which rules came from the references
   * and which the user asked for on the day — a session rule is an override,
   * and an override that cannot be told apart from a reference's own guardrail
   * is indistinguishable from the Librarian having read it that way.
   */
  session: string[];
  /**
   * Conflicts the user resolved before generation could start, with the side
   * they kept. Recorded because "why is this Design ignoring that rule" is
   * otherwise unanswerable.
   */
  resolved: ResolvedConflict[];
}

export interface ResolvedConflict {
  /** The guardrail text that was in conflict. */
  rule: string;
  /** Which reference's version was kept. */
  keptFromItemId: string;
  /** Item ids whose conflicting guardrail was dropped. */
  droppedFromItemIds: string[];
}

/** Sorted by `order`, so callers never depend on stored array position. */
export function orderedReferences(design: DesignRecord): DesignReference[] {
  return design.references.toSorted((a, b) => a.order - b.order);
}

/** The reference that leads the visual direction (spec §6.1). */
export function primaryReference(design: DesignRecord): DesignReference | undefined {
  return orderedReferences(design)[0];
}

/**
 * How many variants a Design actually runs.
 *
 * `per-reference` gives each reference its own variant (spec §6.2), so the
 * requested count does not apply — one reference means one variant, however
 * many the dialog asked for. Deriving it here rather than at the call site
 * keeps the create path and the display of "n variants" from disagreeing.
 */
export function plannedVariantCount(brief: DesignBrief, referenceCount: number): number {
  const clamp = (value: number) => Math.min(MAX_VARIANTS, Math.max(MIN_VARIANTS, value));
  return brief.variationMode === 'per-reference' ? clamp(referenceCount) : clamp(brief.variantCount);
}

/**
 * Every revision the variant has, newest first — which is every revision it has
 * ever had.
 *
 * Nothing is filtered out. A replace marks the revision it replaced rather than
 * hiding it, because "replacement is always recoverable" (spec §6.4) is only
 * true if the replaced revision is still something you can see and click. The
 * mark is what distinguishes replace from retain; it is not a reason to omit it.
 */
export function orderedRevisions(variant: DesignVariant): DesignRevision[] {
  return variant.revisions.toSorted((a, b) => b.createdAt - a.createdAt);
}

export function visibleRevision(variant: DesignVariant): DesignRevision | undefined {
  const chosen = variant.revisions.find((revision) => revision.id === variant.visibleRevisionId);
  // Falling back to the newest keeps a variant renderable if the pointer is
  // lost — a revision on screen is always better than an empty pane.
  return chosen ?? variant.revisions[variant.revisions.length - 1];
}
