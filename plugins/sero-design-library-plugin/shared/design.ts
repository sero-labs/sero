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

import type { TombstonedProvenance } from './records';

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

export interface DesignVariant {
  id: string;
  /** 0-based position in the Design, for stable display order. */
  index: number;
  status: VariantStatus;
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
  deletedAt?: number;
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

export function visibleRevision(variant: DesignVariant): DesignRevision | undefined {
  const chosen = variant.revisions.find((revision) => revision.id === variant.visibleRevisionId);
  // Falling back to the newest keeps a variant renderable if the pointer is
  // lost — a revision on screen is always better than an empty pane.
  return chosen ?? variant.revisions[variant.revisions.length - 1];
}
