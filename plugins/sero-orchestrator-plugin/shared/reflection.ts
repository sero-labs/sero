// Reflective revision layer (the redefined P-E). An independent read-only LLM
// "critic" looks at a loop's real history — separate from the loop trying to pass
// its own criteria — and reflects: is it healthy, stuck, is the plan wrong, did it
// pass thin checks? It is ADVISORY ONLY: it never rewrites the plan or changes
// loop control state. The user acts on its suggestion via edit / replan / resume.
//
// Pi-safe: pure types, re-exported from shared/types.ts.

export type ReflectionVerdict =
  | 'healthy' // progressing or finished cleanly
  | 'stuck' // not making progress; likely needs a human nudge
  | 'plan-mismatch' // the verification plan looks wrong for the goal
  | 'suspicious-completion' // "passed" but the evidence looks thin
  | 'needs-attention'; // anything else worth surfacing

/** Why a reflection ran (a state transition, or an on-demand health check). */
export type ReflectionTrigger = 'blocked' | 'stopped' | 'complete' | 'health-check';

/** An advisory reflection on a loop's health. Stored on the loop; never acted on automatically. */
export interface LoopReflection {
  verdict: ReflectionVerdict;
  /** Plain-English assessment of where the loop actually stands. */
  summary: string;
  /** Plain-English recommended next step (advisory) — e.g. re-derive, clarify, approve. */
  suggestion?: string;
  trigger: ReflectionTrigger;
  at: string; // ISO timestamp
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
}
