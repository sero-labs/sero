/**
 * Usage and log-policy types. Split out of types.ts (500-LOC limit) and
 * re-exported from there so existing imports from './types' keep resolving.
 */

export interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface LogPolicy {
  retainRuns: number;
  retainArtifacts: boolean;
  maxInlineOutputBytes: number;
  /** Durable run digests kept for reflection (survive run pruning). Default 50. */
  retainDigests?: number;
}
