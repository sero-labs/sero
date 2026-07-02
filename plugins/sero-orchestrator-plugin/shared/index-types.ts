/**
 * The watched index file types. The index holds one small summary per loop;
 * full loops live in their own files (loops/<id>/loop.json) so a loop's frequent
 * run-time writes never rewrite every other loop.
 *
 * Split from types.ts (500-LOC limit) and re-exported there. The index summary
 * now also carries a compact attention payload for the home inbox (see
 * specs/09-ui-redesign.md). Type-only imports keep the re-export cycle harmless.
 */

import type {
  CompletionSignal,
  LoopRunStatus,
  LoopStatus,
  RecoveryDecisionKind,
  StepAttemptStatus,
  StepExecutionTarget,
  StepOutcome,
  UsageSummary,
} from './types';
import type { LoopAttention } from './attention-types';
import type { EventFiredBy } from './event-types';
import type { LoopLibraryLink } from './library-types';

/** Step progress for the home overview's active-loop cards (no per-loop read needed). */
export interface LoopProgress {
  /** Total steps in the plan. */
  total: number;
  /** Steps that have succeeded. */
  done: number;
  /** Whether a run is currently in flight. */
  running: boolean;
}

/** Lightweight per-loop entry for the watched index (drives the loop list + home). */
export interface LoopSummary {
  id: string;
  title: string;
  status: LoopStatus;
  summary: string;
  prompt: string;
  /** Count of pending reflection suggestions — drives the loop-list badge. */
  pendingSuggestions?: number;
  /** Count of open questions the loop is waiting on — drives the input badge. */
  pendingInput?: number;
  /** Step progress (present when the plan has steps) — drives the overview progress bar. */
  progress?: LoopProgress;
  /**
   * Compact "needs you" content (pending input + suggestions) so the home inbox
   * can resolve it inline from the watched index alone. Present only when the
   * loop is waiting on the user.
   */
  attention?: LoopAttention;
  /** Library link, when loaded from / saved to the Library — drives the update badge. */
  libraryLink?: LoopLibraryLink;
  createdAt: string;
  updatedAt: string;
}

/** The watched index file: one small entry per loop. */
export interface OrchestratorIndex {
  version: 1;
  loops: LoopSummary[];
}

/**
 * Compact per-run summary stored in `loops/<id>/runs/index.json`. Full runs live
 * one-per-file (`runs/<runId>.json`) so a loop's frequent run writes never bloat
 * loop.json; the UI reads this lightweight index to render run history without
 * loading every run file.
 */
export interface LoopRunStepSummary {
  stepId: string;
  attemptNumber: number;
  executionType: StepExecutionTarget['type'];
  status: StepAttemptStatus;
  outcomeStatus?: StepOutcome['status'];
}

export interface LoopRunSummary {
  id: string;
  runNumber: number;
  status: LoopRunStatus;
  startedAt: string;
  endedAt?: string;
  completionStatus?: CompletionSignal['status'];
  /** The event that started this run (absent for manual/cron runs) — drives the "fired by" chip. */
  firedBy?: EventFiredBy;
  steps: LoopRunStepSummary[];
  recoveries: { decision: RecoveryDecisionKind; reason: string }[];
  /** Rolled-up token/time totals across this run's attempts (cost when reported). */
  usage?: UsageSummary;
}

export interface RunIndex {
  version: 1;
  runs: LoopRunSummary[];
}
