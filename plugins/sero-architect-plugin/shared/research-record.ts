/**
 * Research the Architect has asked for, and what it found.
 *
 * A pending entry is work in flight: a Room, a Workflow, or one agent run
 * directly. A result is what that work produced, kept so a later contract can
 * point at the finding it was built on.
 *
 * Split out of record.ts (500-LOC limit); re-exported from there.
 */

import type { OrchestratorProjectContext } from '@sero-ai/common';

export interface PendingResearch {
  openSpecChange?: string;
  project?: OrchestratorProjectContext;
  kind?: 'room' | 'workflow';
  /**
   * The highest permission the research Room may hold. `read-only` is one shared
   * checkout with no commands; `edit-workspace` gives each member a worktree
   * and a shell, for a question that can only be answered by running something.
   */
  access?: 'read-only' | 'edit-workspace';
  roomId?: string;
  workflowId?: string;
  attempts?: number;
  chargedUsd?: number;
  countedActiveMs?: number;
  /** This runtime observed a live research report; cleared on stop and restart. */
  observedLiveAt?: string;
  /**
   * The tracker run of the one agent this research runs as, saved while it runs
   * so the project page can show its live block. Absent for a Room or Workflow,
   * and absent until the run reports itself.
   */
  runId?: string;
  models?: { name: string; model: string; thinking: string }[];
  id: string;
  question: string;
  stoppingCondition: string;
  startedAt: string;
}

export interface PendingEvidence {
  chargedUsd?: number;
  milestoneId: string;
  commands: string[];
  route: string | null;
  startedAt: string;
}

export interface ResearchResult {
  openSpecChange?: string;
  roomId?: string;
  workflowId?: string;
  models?: { name: string; model: string; thinking: string }[];
  id: string;
  question: string;
  stoppingCondition: string;
  result: string;
  /**
   * Where the full report was saved, relative to the project folder. Absent on
   * an older result and on one that could not be written, so a contract can say
   * the detail is gone instead of pointing at a file that is not there.
   */
  artifactPath?: string;
  costUsd: number;
  completedAt: string;
}
