/**
 * Memory plugin settings, stored in `<profile>/state/memory/config.json`.
 * Every key is optional; a missing or invalid value uses the default.
 */

import { readJsonStateSync } from './json-state';
import { resolveMemoryStatePath } from './state-paths';
import type { Scope } from './entry-format';
import type { SearchMode } from './qmd-index';

export interface MemorySettings {
  /** Most pinned entries per scope. The profile files do not count. */
  pinnedCaps: Record<Scope, number>;
  /** Lowest combined search score (0–1) for recall and for the save-time close-entry check. */
  recallThreshold: number;
  /**
   * The same, until the search model has loaded. Search then matches only the
   * saved terms, and one matching term scores 0.5.
   */
  keywordRecallThreshold: number;
}

/** Set from the offline search test (`eval/memory-search`). */
export const DEFAULT_RECALL_THRESHOLD = 0.6;
export const DEFAULT_KEYWORD_RECALL_THRESHOLD = 0.5;

export const DEFAULT_SETTINGS: MemorySettings = {
  pinnedCaps: { global: 10, workspace: 5 },
  recallThreshold: DEFAULT_RECALL_THRESHOLD,
  keywordRecallThreshold: DEFAULT_KEYWORD_RECALL_THRESHOLD,
};

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function unitInterval(value: unknown, fallback: number): number {
  return typeof value === 'number' && value > 0 && value < 1 ? value : fallback;
}

export function readMemorySettings(): MemorySettings {
  const raw = readJsonStateSync<Record<string, unknown>>(resolveMemoryStatePath('config.json'), {});
  return {
    pinnedCaps: {
      global: positiveInteger(raw.pinnedGlobalCap, DEFAULT_SETTINGS.pinnedCaps.global),
      workspace: positiveInteger(raw.pinnedWorkspaceCap, DEFAULT_SETTINGS.pinnedCaps.workspace),
    },
    recallThreshold: unitInterval(raw.recallThreshold, DEFAULT_SETTINGS.recallThreshold),
    keywordRecallThreshold: unitInterval(raw.keywordRecallThreshold, DEFAULT_SETTINGS.keywordRecallThreshold),
  };
}

/** The score a result needs, for the mode the search ran in. */
export function recallThresholdFor(mode: SearchMode, settings = readMemorySettings()): number {
  return mode === 'hybrid' ? settings.recallThreshold : settings.keywordRecallThreshold;
}
