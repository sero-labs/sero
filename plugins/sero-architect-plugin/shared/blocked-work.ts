// The delegated work a project is blocked on. Split from record.ts to keep that file small.

/** The delegated work a project is blocked on, and what is known about it. */
export interface BlockedWork {
  kind: 'workflow' | 'room';
  id: string;
  /** What the work is called. Saved when the block is raised, where it is known. */
  title: string | null;
  /** The state the work ended in, e.g. `cancelled`. */
  status: string;
  /** When the Architect observed that ending. */
  at: string;
  /**
   * Why it ended, when something recorded a cause. A cause is never inferred
   * from a count of attempts: `PendingResearch.attempts` counts attempts to
   * plan the work, not times the work itself stopped.
   */
  cause?: BlockedWorkCause;
}

export interface BlockedWorkCause {
  /** The cause in plain words, for the project page. */
  text: string;
  /** The decision this cause came from, when it came from one. */
  decisionId?: string;
}
