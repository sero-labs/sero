// The durable project record: the single source of truth for one Architect
// project. JSON-serialisable only. The runtime is its only writer.

import type { ArchitectOverlay, ArchitectPhase } from './types';

export type { ArchitectOverlay, ArchitectPhase } from './types';

export const PHASE_ORDER: readonly ArchitectPhase[] = ['intake', 'discovery', 'charter', 'build', 'release', 'maintain'];

export type AutonomySetting = 'milestones' | 'charter-only' | 'model-judged';

export type MilestoneStatus = 'planned' | 'approved' | 'running' | 'verifying' | 'done' | 'parked';

/** The four evidence states. A lower one never stands in for a higher one. */
export type VerificationState = 'reported' | 'verified' | 'accepted' | 'delivered';

export interface EvidenceCommand {
  command: string;
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface EvidenceRecord {
  /** The commit every item was checked against. */
  commit: string;
  checkedAt: string;
  commands: EvidenceCommand[];
  /** Diff summary from git, present when the milestone changed files. */
  diffSummary: string | null;
  /** The runtime's own smoke check and capture for a preview milestone. */
  preview: { route: string; smokePassed: boolean; capturePath: string | null } | null;
  /** True when every item passed; the runtime computes it, never the owner. */
  passed: boolean;
  /** Set when the milestone's files changed after this evidence was taken. */
  stale: boolean;
}

export interface MilestoneDispatch {
  kind: 'workflow' | 'room';
  id: string;
  workspaceId: string;
  dispatchedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  plan: string | null;
  /** A preview milestone must close with a smoke check and a capture. */
  preview: { route: string } | null;
  dispatch: MilestoneDispatch | null;
  evidence: EvidenceRecord | null;
  verification: VerificationState | null;
  /** The decision that parked this milestone, while it is open. */
  parkedBy: string | null;
  /** Release receipt reference once delivered. */
  receipt: string | null;
}

export interface DecisionOption {
  id: string;
  label: string;
  consequence: string;
}

export interface Decision {
  id: string;
  question: string;
  options: DecisionOption[];
  recommendation: string;
  reason: string;
  dependsOn: string[];
  raisedAt: string;
  answer: { optionId: string; note: string | null; answeredAt: string } | null;
}

export interface Directive {
  id: string;
  text: string;
  sentAt: string;
  reply: { text: string; repliedAt: string } | null;
}

export interface ResearchResult {
  id: string;
  question: string;
  stoppingCondition: string;
  result: string;
  costUsd: number;
  completedAt: string;
}

export interface Charter {
  milestoneIds: string[];
  escalationPolicy: string;
  autonomy: AutonomySetting;
  capUsd: number;
  proposedAt: string;
  approvedAt: string | null;
}

export interface Budget {
  capUsd: number | null;
  spentUsd: number;
  /** Where the spend came from, so a raise can be reasoned about. */
  sources: { owner: number; research: number; dispatched: number };
}

export interface HistoryEntry {
  at: string;
  phase: ArchitectPhase;
  overlay: ArchitectOverlay | null;
  cause: string;
}

export interface OwnerSessionState {
  grantHandleId: string | null;
  /** Consecutive turns that ended without an outcome call. Three block the project. */
  silentTurns: number;
  lastWakeAt: string | null;
}

export interface ProjectRecord {
  version: 1;
  id: string;
  name: string;
  /** The user's idea, verbatim, never edited. */
  idea: string;
  folder: string;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
  phase: ArchitectPhase;
  /** Derived on every write from the flags below; see lifecycle.ts. */
  overlay: ArchitectOverlay | null;
  stateLine: string;
  brief: string | null;
  charter: Charter | null;
  autonomy: AutonomySetting;
  budget: Budget;
  milestones: Milestone[];
  decisions: Decision[];
  directives: Directive[];
  research: ResearchResult[];
  history: HistoryEntry[];
  session: OwnerSessionState;
  paused: boolean;
  blockedReason: string | null;
}

export interface NewProjectInput {
  id: string;
  name: string;
  idea: string;
  folder: string;
  now: string;
}

export function createProjectRecord(input: NewProjectInput): ProjectRecord {
  return {
    version: 1,
    id: input.id,
    name: input.name,
    idea: input.idea,
    folder: input.folder,
    workspaceId: null,
    createdAt: input.now,
    updatedAt: input.now,
    phase: 'intake',
    overlay: null,
    stateLine: 'Setting up the workspace.',
    brief: null,
    charter: null,
    autonomy: 'milestones',
    budget: { capUsd: null, spentUsd: 0, sources: { owner: 0, research: 0, dispatched: 0 } },
    milestones: [],
    decisions: [],
    directives: [],
    research: [],
    history: [{ at: input.now, phase: 'intake', overlay: null, cause: 'created from the idea and folder' }],
    session: { grantHandleId: null, silentTurns: 0, lastWakeAt: null },
    paused: false,
    blockedReason: null,
  };
}

export function openDecisions(record: ProjectRecord): Decision[] {
  return record.decisions.filter((decision) => decision.answer === null);
}

/** Open decisions plus approvals the user owes: the needs-you count the index carries. */
export function needsYouCount(record: ProjectRecord): number {
  const charterApproval = record.phase === 'charter' && record.charter !== null && record.charter.approvedAt === null ? 1 : 0;
  const planApprovals = record.autonomy === 'milestones'
    ? record.milestones.filter((m) => m.status === 'planned' && m.plan !== null && record.phase === 'build').length
    : 0;
  return openDecisions(record).length + charterApproval + planApprovals;
}

/** The index row the UI, the widget and the management tool read. Derived, never edited by hand. */
export function toIndexEntry(record: ProjectRecord): import('./types').ArchitectIndexEntry {
  return {
    id: record.id,
    name: record.name,
    workspaceId: record.workspaceId,
    phase: record.phase,
    overlay: record.overlay,
    stateLine: record.stateLine,
    spentUsd: record.budget.spentUsd,
    capUsd: record.budget.capUsd,
    needsYou: needsYouCount(record),
    updatedAt: record.updatedAt,
  };
}
