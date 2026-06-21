// LLM-authored verification model (spec 05). A loop's definition of "done" is
// derived by the verification planner from the plain-English goal alone — never
// typed by a user, supplied by a test, or hard-coded as a heuristic (spec 05 §1).
//
// Pi-safe: pure types, no host imports. Re-exported from shared/types.ts so the
// rest of the plugin keeps importing everything from one place.

/**
 * The LLM-authored definition of "done" for a loop (D-18). The verification
 * planner (a read-only worker, D-19) derives it from the goal. Each criterion
 * carries its own evaluation strategy; the planner chooses mechanical evaluation
 * when the evidence is conclusive and an LLM judge when it is a judgement (D-20).
 */
export interface VerificationPlan {
  /** Success criteria that together mean the goal is achieved. */
  criteria: SuccessCriterion[];
  /** LLM-derived stop conditions mapped onto the engine (spec 05 §7, P-D). */
  stopConditions: StopCondition[];
  /** Provenance: when the plan was derived, from which goal, and what it cost. */
  derivedFrom: PlanProvenance;
}

export interface PlanProvenance {
  /** Hash of the goal text this plan was derived from; drives re-derivation. */
  goalHash: string;
  at: string; // ISO timestamp of derivation
  model?: string; // planner model
  /** Planner spend, folded into the cumulative run budget (D-17). */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
}

/** One success criterion plus how the planner chose to verify it. */
export interface SuccessCriterion {
  id: string;
  /** Plain-English, authored by the planner from the goal. */
  description: string;
  /** Read-only / measurement evidence gathered before the decision. */
  evidence: EvidenceStep[];
  /** How the gathered evidence becomes pass/fail. */
  decision: Decision;
  /** Must-pass (gates completion) vs informational. */
  required: boolean;
}

/**
 * Read-only or measurement gathering, run at the canonical cwd before a
 * criterion's decision (spec 05 §4.1).
 */
export type EvidenceStep =
  | { kind: 'run'; command: string } // run a command; capture stdout/stderr/exit/duration
  | { kind: 'read'; path: string } // read a file's contents
  | { kind: 'diff' } // the attempt's diff at the cwd
  | { kind: 'gitLog'; since?: string }; // commits in a window (e.g. "yesterday")

export type EvidenceKind = EvidenceStep['kind'];

/**
 * How evidence becomes pass/fail (spec 05 §4.2). Mechanical (`exit-zero` /
 * `threshold`) when the evidence is conclusive; `judge` when it is a judgement —
 * the planner decides which (D-20).
 */
export type Decision =
  | { kind: 'exit-zero' } // pass iff a `run` step exited 0 (mechanical)
  | {
      kind: 'threshold'; // extract a number and compare (mechanical)
      metric: string; // what to read from the run output (label only)
      op: ThresholdOp;
      value: number;
      aggregate?: ThresholdAggregate; // across per-item numbers; defaults to 'all'
    }
  | { kind: 'judge'; rubric: string }; // a read-only judge LLM grades the evidence

export type DecisionKind = Decision['kind'];

export type ThresholdOp = '<' | '<=' | '>' | '>=' | '==';

/** How multiple measured numbers combine: every item passes, or a fraction does. */
export type ThresholdAggregate =
  | { kind: 'all' }
  | { kind: 'fraction-at-least'; fraction: number };

/**
 * An LLM-derived stop condition mapped onto the engine (spec 05 §7). Most derived
 * conditions reuse the existing engine and need no plan entry (all-required-pass →
 * `complete`, stalls → `no-progress`, maxAttempts → `stopped`); these two are the
 * ones the planner declares explicitly and the engine wires in P-D.
 */
export interface StopCondition {
  kind: 'approval-required' | 'verification-unavailable';
  reason?: string; // plain-English why
}
