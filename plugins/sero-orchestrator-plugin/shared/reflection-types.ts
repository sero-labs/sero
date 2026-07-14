/**
 * Loop reflection (self-improvement) types. See specs/06-reflection.md.
 *
 * Split from types.ts (500-LOC limit) and re-exported there so existing imports
 * keep resolving. The type-only import from ./types is erased at compile time, so
 * the re-export cycle is harmless.
 */

import type {
  LoopPlan,
  LoopRunStatus,
  RecoveryDecisionKind,
  StepStatus,
  UsageSummary,
} from './types';

/** One step's contribution to a run digest. */
export interface RunDigestStep {
  id: string;
  title: string;
  status: StepStatus;
  attempts: number;
  model?: string;
  durationMs?: number;
  /** Present only when the step failed / blocked / needed revision. */
  failureSummary?: string;
}

/**
 * A compact, durable record of one finished run. Stored in the loop's own
 * `digests.json`, it survives run pruning and is the long-term memory reflection
 * reads. Far smaller than a full LoopRun, so many more are retained.
 */
export interface RunDigest {
  runNumber: number;
  status: LoopRunStatus;
  statusReason?: string;
  retryAt?: string;
  completion?: 'complete' | 'blocked';
  startedAt: string;
  endedAt?: string;
  steps: RunDigestStep[];
  recoveries: { stepId: string; decision: RecoveryDecisionKind; reason: string }[];
  usage?: UsageSummary;
}

/** The durable digest file persisted at `loops/<id>/digests.json`. */
export interface DigestLog {
  version: 1;
  digests: RunDigest[];
}

/** A learned fact about how this loop runs, carried across reflection passes. */
export interface LoopInsight {
  id: string;
  summary: string;
  createdAt: string;
  /** Run numbers that evidenced this insight. */
  fromRunNumbers?: number[];
}

export type SuggestionConfidence = 'low' | 'medium' | 'high';
export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

/**
 * A pending, history-driven improvement awaiting user approval. When approved it
 * is applied through the existing validated revise path (recording a
 * PlanRevision); when rejected it is kept with a reason and fed back to later
 * reflection so the same idea is not re-proposed.
 */
export interface LoopSuggestion {
  id: string;
  createdAt: string;
  /** v1: plan + step-instruction changes both ride the plan path. */
  target: 'plan';
  rationale: string;
  confidence: SuggestionConfidence;
  /** Full proposed plan (validated; stable ids where unchanged). */
  proposedPlan: LoopPlan;
  /** Steps the proposal changes, for a concise UI diff. */
  changedStepIds: string[];
  status: SuggestionStatus;
  rejectionReason?: string;
  decidedAt?: string;
}
