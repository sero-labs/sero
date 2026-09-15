/**
 * Project and run attribution for created Workflows and Rooms.
 *
 * Split from the creation contract to keep each file within the 500-LOC limit.
 * A caller such as Architect attaches project/run correlation and the tier
 * defaults it resolved before planning. The context is attribution only: it
 * grants no access to another project, session or workspace, and creation keeps
 * its existing planner, validation, placement, approval and grant boundaries.
 */

import type { ModelTier, SharedModelTierEntry } from './model-selection/types';

// ── Optional project execution context ──
//
// A caller such as Architect may attach project/run correlation and the tier
// defaults it resolved before planning. The context is attribution only. It
// grants no access to another project, session or workspace, and creation keeps
// its existing planner, validation, placement, approval and grant boundaries.

/** One resolved tier entry plus why it was chosen. */
export interface OrchestratorProjectTierSnapshot extends SharedModelTierEntry {
  /** Provenance, e.g. `project override`, `inherited global` or `manual step pin`. */
  source?: string;
}

/** Effective tier defaults captured before planning. Absent tiers inherit at the consumer. */
export type OrchestratorProjectModelSnapshot = Partial<Record<ModelTier, OrchestratorProjectTierSnapshot>>;

/** Project and run attribution for one created Workflow or Room. */
export interface OrchestratorProjectContext {
  /** The owning project. Must match the project that owns the target workspace. */
  projectId: string;
  /** The run identity the created work belongs to. */
  runId: string;
  /** The project configuration revision used to resolve `modelSnapshot`. */
  configRevision?: number;
  /** Tier defaults resolved before planning. Absent when the caller resolved none. */
  modelSnapshot?: OrchestratorProjectModelSnapshot;
}

/**
 * How a caller expressed recurrence at creation.
 *
 * - `one-off`: the caller declares the work does not recur.
 * - `supplied`: the caller supplies validated triggers.
 * - `unspecified`: the caller leaves intent to natural-language extraction.
 */
export type OrchestratorTriggerIntent = 'one-off' | 'supplied' | 'unspecified';


/**
 * True when both sides describe the same project and run, including both absent.
 * A recovery that drops or changes a saved attribution is not the same request.
 */
export function sameOrchestratorProjectAttribution(
  saved: OrchestratorProjectContext | undefined,
  requested: OrchestratorProjectContext | undefined,
): boolean {
  if (!saved && !requested) return true;
  if (!saved || !requested) return false;
  return saved.projectId === requested.projectId && saved.runId === requested.runId;
}

export type OrchestratorProjectContextCheck =
  | { ok: true; project?: OrchestratorProjectContext }
  | { ok: false; error: string };

/**
 * Checks optional project correlation against the project that owns the target
 * workspace. An absent context keeps existing behaviour. A context that names a
 * foreign project, or one attributed from a workspace no project owns, is refused.
 */
export function checkOrchestratorProjectContext(
  context: OrchestratorProjectContext | undefined,
  owner: { projectId: string } | null,
): OrchestratorProjectContextCheck {
  if (!context) return { ok: true };
  if (!context.projectId || !context.runId) {
    return { ok: false, error: 'Project correlation needs both a projectId and a runId.' };
  }
  if (!owner) {
    return { ok: false, error: `Project "${context.projectId}" cannot be attributed from a workspace that no project owns.` };
  }
  if (owner.projectId !== context.projectId) {
    return { ok: false, error: `Project "${context.projectId}" cannot be attributed from the workspace of project "${owner.projectId}".` };
  }
  return { ok: true, project: context };
}
