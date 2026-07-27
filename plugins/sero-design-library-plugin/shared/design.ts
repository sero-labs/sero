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
 * One generated result. Revisions are append-only within a variant: replacing
 * the visible result moves a pointer, it does not destroy what was there.
 */
export interface DesignRevision {
  id: string;
  createdAt: number;
  /** Source for the chosen output target — TSX for react, a document for html. */
  code: string;
  /** Present once the runtime has built this revision into a preview document. */
  builtFile?: string;
  /** Emitted with the revision and bound to it; see the note at the top. */
  tweakManifestFile?: string;
  /** What the model said it was going for, for the revision selector. */
  summary: string;
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

export function visibleRevision(variant: DesignVariant): DesignRevision | undefined {
  const chosen = variant.revisions.find((revision) => revision.id === variant.visibleRevisionId);
  // Falling back to the newest keeps a variant renderable if the pointer is
  // lost — a revision on screen is always better than an empty pane.
  return chosen ?? variant.revisions[variant.revisions.length - 1];
}
