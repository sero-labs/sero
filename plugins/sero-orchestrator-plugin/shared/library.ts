/**
 * Pure transforms between a live Loop and a SharedLoopDefinition (the library
 * payload). See specs/08-loop-library.md. The host-dependent `instantiate`
 * (which mints ids and a fresh runtime) lives in runtime/library.ts.
 */

import type {
  LibraryEntry,
  LibraryVersion,
  Loop,
  LoopLibraryLink,
  LoopPlan,
  LoopTrigger,
  SharedLoopDefinition,
  SharedTriggerConfig,
} from './types';

/** Reduces a materialized trigger to its portable config (drops ids and fire counters). */
export function toSharedTrigger(trigger: LoopTrigger): SharedTriggerConfig {
  return {
    type: trigger.type,
    schedule: trigger.schedule,
    eventSource: trigger.eventSource,
    eventFilter: trigger.eventFilter,
    eventCondition: trigger.eventCondition,
    debounceMs: trigger.debounceMs,
    maxFires: trigger.maxFires,
  };
}

/**
 * Builds the library payload from a loop: the plan, triggers, limits, log policy,
 * and context overrides — everything that describes what the loop does, and
 * nothing tied to one running instance (no runtime, runs, ids, or workspace).
 * The plan already embeds the loop's current per-step model/tool picks.
 */
export function toSharedDefinition(loop: Loop): SharedLoopDefinition {
  return {
    schemaVersion: 1,
    prompt: loop.prompt,
    title: loop.title,
    summary: loop.summary,
    plan: structuredClone(loop.plan),
    triggers: loop.triggers.map(toSharedTrigger),
    limits: { ...loop.limits },
    logPolicy: { ...loop.logPolicy },
    contextOverrides: loop.contextOverrides ? structuredClone(loop.contextOverrides) : undefined,
  };
}

export interface LibrarySave {
  entry: LibraryEntry;
  version: LibraryVersion;
  link: LoopLibraryLink;
}

/**
 * Builds the entry + version + link for saving a loop into the library.
 * `existing` is the current entry when bumping a version, or null to start a new
 * entry at v1. Versions are immutable and monotonic. The entry's editable `name`
 * is preserved when bumping (the user may have renamed it); its `summary` tracks
 * the loop's latest. The version embeds the full definition.
 */
export function buildLibrarySave(params: {
  loop: Loop;
  existing: LibraryEntry | null;
  entryId: string;
  name: string;
  note?: string;
  now: string;
  savedFromWorkspaceId: string;
}): LibrarySave {
  const { loop, existing, entryId, name, note, now, savedFromWorkspaceId } = params;
  const versionNumber = existing ? existing.latestVersion + 1 : 1;
  const entry: LibraryEntry = existing
    ? { ...existing, summary: loop.summary, latestVersion: versionNumber, updatedAt: now }
    : { id: entryId, name, summary: loop.summary, latestVersion: versionNumber, createdAt: now, updatedAt: now };
  const version: LibraryVersion = {
    version: versionNumber,
    definition: toSharedDefinition(loop),
    note: note?.trim() || undefined,
    savedFromWorkspaceId,
    createdAt: now,
  };
  return { entry, version, link: { entryId: entry.id, version: versionNumber, syncedAt: now } };
}

/**
 * A canonical signature of a plan's STRUCTURE — steps, instructions, deps,
 * guards, objective — with the per-step model/tool overlay fields removed. Two
 * plans share a signature when they differ only by local model/tool picks.
 */
export function structuralPlanSignature(plan: LoopPlan): string {
  const steps = plan.steps.map((step) => {
    const execution = { ...(step.execution as unknown as Record<string, unknown>) };
    // Overlay fields are a local layer (see specs/08-loop-library.md), not structure.
    delete execution.model;
    delete execution.thinking;
    delete execution.tools;
    return { ...step, execution };
  });
  return JSON.stringify({ objective: plan.objective, globalInstructions: plan.globalInstructions, variablesSchema: plan.variablesSchema, steps });
}

/** True when two plans differ in structure (ignoring the local model/tool overlay). */
export function plansStructurallyDiffer(a: LoopPlan, b: LoopPlan): boolean {
  return structuralPlanSignature(a) !== structuralPlanSignature(b);
}
