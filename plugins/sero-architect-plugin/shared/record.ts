// The durable project record: the single source of truth for one Architect
// project. JSON-serialisable only. The runtime is its only writer.

import type { SharedModelTierSettings } from '@sero-ai/common';
import type { DispatchDestination } from './owner-actions';
import type { ArchitectOverlay, ArchitectPhase } from './types';

export type { ArchitectOverlay, ArchitectPhase } from './types';

export const PHASE_ORDER: readonly ArchitectPhase[] = ['intake', 'discovery', 'charter', 'build', 'release', 'maintain'];

export const EXECUTION_MODES = ['workspace', 'worktree'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

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
  /** Hash of tracked and untracked project content when the checks ran. */
  fingerprint?: string;
  checkedAt: string;
  commands: EvidenceCommand[];
  /** Diff summary from git, present when the milestone changed files. */
  diffSummary: string | null;
  /** Whether the runtime found project file changes against the dispatch baseline. */
  filesChanged: boolean;
  /** The runtime's own smoke check and capture for a preview milestone. */
  preview: { route: string; smokePassed: boolean; capturePath: string | null; failure?: string } | null;
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
  /** Reported usage already charged to the project, so an index re-read never double-charges. */
  chargedUsd: number;
  /** Where the run delivers, for a release milestone. */
  destination: string | null;
  /** HEAD before work started, used to summarize committed milestone changes. */
  baseCommit?: string;
  /** Latest execution failed or was interrupted, even if the workflow is enabled. */
  failure?: string;
  retryStepId?: string;
  /** The Workflow stopped at this total dollar cap. A new cap needs user approval. */
  costLimitUsd?: number;
}

export interface PendingMilestoneDispatch {
  planningChargedUsd?: number;
  /** Absent on records written before recoverable dispatch creation. */
  request?: { id: string; prompt: string; maxCostUsd: number | null };
  kind: 'workflow' | 'room';
  destination: DispatchDestination | null;
  startedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  plan: string | null;
  /** A preview milestone must close with a smoke check and a capture. */
  preview: { route: string } | null;
  dispatch: MilestoneDispatch | null;
  /** Durable intent written before the external run starts. A surviving value needs reconciliation. */
  pendingDispatch?: PendingMilestoneDispatch;
  evidence: EvidenceRecord | null;
  verification: VerificationState | null;
  /** The decision that parked this milestone, while it is open. */
  parkedBy: string | null;
  /** The status to return to when every parking decision is answered. */
  parkedFrom: MilestoneStatus | null;
  /** Every open decision that currently parks this milestone. */
  parkedByDecisions?: string[];
  /** Release receipt reference once delivered. */
  receipt: string | null;
}

export interface DecisionOption {
  id: string;
  label: string;
  consequence: string;
}

export type DecisionProposal =
  | { kind: 'charter'; charter: Charter; milestones: Milestone[] }
  | { kind: 'dispatch'; milestoneId: string; dispatchKind: 'workflow' | 'room'; prompt: string; destination: string }
  | { kind: 'cap'; capUsd: number };

export interface Decision {
  id: string;
  question: string;
  options: DecisionOption[];
  recommendation: string;
  reason: string;
  /** Milestone ids this decision parks while open. */
  dependsOn: string[];
  raisedAt: string;
  /** A forced escalation carries what it proposes, applied only when the user picks `apply`. */
  proposal: DecisionProposal | null;
  answer: { optionId: string; note: string | null; answeredAt: string } | null;
}

export interface Directive {
  id: string;
  text: string;
  sentAt: string;
  reply: { text: string; repliedAt: string } | null;
}

export interface PendingResearch {
  kind?: 'room' | 'workflow';
  roomId?: string;
  workflowId?: string;
  attempts?: number;
  chargedUsd?: number;
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
  roomId?: string;
  workflowId?: string;
  models?: { name: string; model: string; thinking: string }[];
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
  incomplete?: boolean;
  incompleteSources?: string[];
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
  /** Earlier grants and transcripts remain available after a model change. */
  previousSessions?: { grantId: string | null; sessionPath: string; model: string | null }[];
  /** Set only while the runtime is delivering a turn. Cleared on restart. */
  workingSince?: string | null;
  /** The host-issued grant the owner session runs under. Null until approved. */
  grantId: string | null;
  /** The subject inside the grant. Always `owner`; kept on the record for the CLI scope. */
  subject: 'owner';
  sessionId: string | null;
  /** Absolute Pi session file. The only caller signal the owner tool trusts. */
  sessionPath: string | null;
  /** The tools the host actually granted, which may be fewer than proposed. */
  grantedTools: string[] | null;
  model: string | null;
  thinking: string | null;
  /** Consecutive turns that ended without an outcome call. Three block the project. */
  silentTurns: number;
  lastWakeAt: string | null;
  /** The kind of the last wake delivered, so a quiet follow-up is raised at most once. */
  lastWakeKind: string | null;
  turns: number;
  /** Cumulative session cost last read from the host, so each turn charges only its delta. */
  sessionCostUsd: number;
}

export interface ProjectRecord {
  version: 1;
  /** Absent on older projects until the user saves the execution setting. */
  executionMode?: ExecutionMode;
  /** Admin selections shown before work approval; refreshed by the owner runtime. */
  modelTiers?: SharedModelTierSettings;
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
  /** Durable while the maintenance Workflow is being prepared. */
  preparingMaintenance?: boolean;
  brief: string | null;
  charter: Charter | null;
  autonomy: AutonomySetting;
  budget: Budget;
  milestones: Milestone[];
  decisions: Decision[];
  directives: Directive[];
  research: ResearchResult[];
  /** Background work recorded before it starts, so restart can recover it. */
  pendingResearch?: PendingResearch[];
  pendingEvidence?: PendingEvidence[];
  history: HistoryEntry[];
  session: OwnerSessionState;
  paused: boolean;
  blockedReason: string | null;
}

export interface NewProjectInput {
  executionMode?: ExecutionMode;
  id: string;
  name: string;
  idea: string;
  folder: string;
  now: string;
}

export function createProjectRecord(input: NewProjectInput): ProjectRecord {
  return {
    version: 1,
    executionMode: input.executionMode ?? 'workspace',
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
    budget: { capUsd: null, spentUsd: 0, incomplete: false, sources: { owner: 0, research: 0, dispatched: 0 } },
    milestones: [],
    decisions: [],
    directives: [],
    research: [],
    pendingResearch: [],
    pendingEvidence: [],
    history: [{ at: input.now, phase: 'intake', overlay: null, cause: 'created from the idea and folder' }],
    session: {
      grantId: null,
      subject: 'owner',
      sessionId: null,
      sessionPath: null,
      grantedTools: null,
      model: null,
      thinking: null,
      silentTurns: 0,
      lastWakeAt: null,
      lastWakeKind: null,
      turns: 0,
      sessionCostUsd: 0,
    },
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
  // The dispatch gate wants an approved plan in build, release and maintain alike.
  const working = record.phase === 'build' || record.phase === 'release' || record.phase === 'maintain';
  const planApprovals = record.autonomy === 'milestones' && working
    ? record.milestones.filter((m) => m.status === 'planned' && m.plan !== null).length
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
    usageIncomplete: record.budget.incomplete !== false,
    capUsd: record.budget.capUsd,
    needsYou: needsYouCount(record),
    updatedAt: record.updatedAt,
  };
}
