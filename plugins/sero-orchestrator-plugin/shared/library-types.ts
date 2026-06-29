/**
 * Loop Library data model (see specs/08-loop-library.md).
 *
 * The library is a profile-global, versioned store of loop *definitions*. A
 * version stores everything that describes what a loop does and nothing specific
 * to one running instance, so it can be loaded into any workspace. Persisted
 * under `$SERO_HOME/apps/orchestrator-library/`, never in a workspace's loop.json.
 */

import type { ContextOverrides, LoopLimits, LoopPlan, LogPolicy } from './types';

/** A trigger's portable config — no ids, no fire counters, no loop/workspace binding. */
export interface SharedTriggerConfig {
  type: 'manual' | 'cron' | 'event' | 'hybrid';
  schedule?: string;
  eventSource?: string;
  eventFilter?: Record<string, unknown>;
  debounceMs?: number;
  maxFires?: number;
}

/** The shareable payload: a loop minus all instance/runtime state. */
export interface SharedLoopDefinition {
  schemaVersion: 1;
  prompt: string;
  title: string;
  summary: string;
  plan: LoopPlan;
  triggers: SharedTriggerConfig[];
  limits: LoopLimits;
  logPolicy: LogPolicy;
  contextOverrides?: ContextOverrides;
}

/** One immutable, monotonically numbered version of an entry. */
export interface LibraryVersion {
  version: number;
  definition: SharedLoopDefinition;
  /** Optional "what changed" note. */
  note?: string;
  /** Provenance only — the workspace this version was saved from. */
  savedFromWorkspaceId?: string;
  createdAt: string;
}

export interface LibraryEntry {
  id: string;
  /** Editable label (defaults to the loop title). */
  name: string;
  summary: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** One row in the watched index.json. */
export interface LibraryEntrySummary {
  id: string;
  name: string;
  summary: string;
  latestVersion: number;
  versionCount: number;
  updatedAt: string;
}

export interface LibraryIndex {
  version: 1;
  entries: LibraryEntrySummary[];
}

/** Set on a loop loaded from / saved to the library; absent ⇒ standalone. */
export interface LoopLibraryLink {
  entryId: string;
  /** The version this loop is currently on. */
  version: number;
  syncedAt: string;
}

/**
 * Instance-local per-step overrides, replayed after a version switch so they
 * survive the plan being replaced. Not part of a SharedLoopDefinition (the
 * published plan already embeds the picks).
 */
export interface StepOverride {
  model?: string;
  thinking?: string;
  tools?: string[];
}
