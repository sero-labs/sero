/**
 * Shared state shape for Plan Mode.
 *
 * Both the Pi extension and the Sero web UI read/write JSON files
 * matching these shapes. The extension writes them; the UI reads
 * via useAppState (state.json) and direct IPC reads (index.json, plan files).
 */

export interface PlanStep {
  step: number;
  text: string;
  completed: boolean;
}

export type PlanMode = 'normal' | 'plan' | 'execute';

/** Current plan state — lives in state.json. */
export interface PlanModeState {
  mode: PlanMode;
  steps: PlanStep[];
}

export const DEFAULT_STATE: PlanModeState = {
  mode: 'normal',
  steps: [],
};

// ── Archive types ────────────────────────────────────────────

/** Entry in the archive index (index.json). */
export interface PlanIndexEntry {
  /** Filename relative to the planmode folder, e.g. "plan-2026-02-20T19-14-29.json" */
  filename: string;
  /** ISO 8601 completion timestamp. */
  completedAt: string;
  /** Number of steps in the plan. */
  stepCount: number;
  /** First step text, truncated — used as a preview. */
  summary: string;
}

/** Shape of index.json — the archive manifest. */
export interface PlanIndex {
  plans: PlanIndexEntry[];
}

export const DEFAULT_INDEX: PlanIndex = {
  plans: [],
};

/** Shape of an individual plan-<timestamp>.json archive file. */
export interface ArchivedPlan {
  completedAt: string;
  steps: PlanStep[];
}
