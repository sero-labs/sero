/**
 * IssueTracker interface + factory.
 *
 * The orchestrator is tracker-agnostic. All issue sourcing goes through
 * this common interface. The factory reads config.tracker.kind and
 * returns the appropriate implementation.
 */

import type { Issue, SymphonyConfig } from '../shared/types';
import { LinearTracker } from './linear-client';
import { FileTracker } from './file-tracker';

// ── Interface ──────────────────────────────────────────────────

export interface IssueTracker {
  kind: 'linear' | 'file';

  /** Fetch issues eligible for dispatch (active states, not terminal). */
  fetchCandidateIssues(): Promise<Issue[]>;

  /** Bulk-refresh current state for a set of issue IDs (reconciliation). */
  fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>>;

  /** Transition an issue to a new state (e.g., mark done / failed). */
  transitionIssue?(issueId: string, toState: string): Promise<void>;

  /** Dispose watchers / connections. */
  destroy(): void;
}

// ── Factory ────────────────────────────────────────────────────

export function createTracker(config: SymphonyConfig): IssueTracker {
  if (config.tracker.kind === 'file') {
    return new FileTracker(config.tracker);
  }
  return new LinearTracker(config.tracker);
}
