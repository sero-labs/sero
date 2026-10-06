// The durable project record: the single source of truth for one Architect
// project. JSON-serialisable only. The runtime is its only writer.

import type { ModelTier, OrchestratorProjectContext, SharedModelTierSettings } from '@sero-ai/common';
import type { DeliveryAgreement, OverviewSummary, WorkingInterpretation } from './agreement';
import type { BlockedWork } from './blocked-work';
import type { DirectExecution } from './direct-execution';
import type { WaitRegistration } from './waits';
import type { EvidenceBinding } from './evidence-binding';
import type { DispatchDestination } from './owner-actions';
import { milestoneCounts, projectActivity } from './activity';
import type { SelectionSource } from './model-config';
import type { ArchitectOverlay, ArchitectPhase } from './types';

export type { ArchitectOverlay, ArchitectPhase } from './types';
export type { DeliveryAgreement, OverviewSummary, WorkingInterpretation } from './agreement';

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
  /** What the check covers. Absent on evidence saved before bindings. */
  binding?: EvidenceBinding;
}

export interface MilestoneDispatch {
  kind: 'workflow' | 'room';
  id: string;
  workspaceId: string;
  dispatchedAt: string;
  /** Reported usage already charged to the project, so an index re-read never double-charges. */
  chargedUsd: number;
  /** The start budget promised to this run. See `shared/budget.ts`. */
  allocatedUsd?: number;
  /** Reported working time already journaled, on the same rule as `chargedUsd`. */
  countedActiveMs?: number;
  /** Where the run delivers, for a release milestone. */
  destination: string | null;
  /** HEAD before work started, used to summarize committed milestone changes. */
  baseCommit?: string;
  /**
   * The run this work was dispatched under. Late usage is charged to it even
   * after the run closes, instead of to whichever run happens to be open.
   */
  runId?: string;
  /** Latest execution failed or was interrupted, even if the workflow is enabled. */
  failure?: string;
  retryStepId?: string;
  /** The Workflow stopped at this total dollar cap. A new cap needs user approval. */
  costLimitUsd?: number;
  /** For a standing subscription such as maintenance: when it last ran and when its schedule fires next. */
  lastRunAt?: string;
  nextRunAt?: string;
  /**
   * The last time THIS runtime session watched this work report. Cleared when
   * the runtime starts, so a saved value can never claim a run is live (see
   * runtime/dispatch-watch.ts). It is what "Working" is earned with.
   */
  observedLiveAt?: string;
  /**
   * Triggers this project's pause disarmed, so resume re-arms exactly those and
   * leaves alone any the user turned off by hand.
   */
  disarmedTriggerIds?: string[];
  /** Who paused this run, so only the same hand resumes it. See `runtime/linked-work.ts`. */
  heldBy?: 'project' | 'owner';
  /** Set when the owner took the milestone over after this run finished, so it is no longer a writer. */
  finishedAt?: string;
}

export interface PendingMilestoneDispatch {
  planningChargedUsd?: number;
  /** Absent on records written before recoverable dispatch creation. */
  request?: { id: string; prompt: string; maxCostUsd: number | null };
  /**
   * Project/run attribution and the tier defaults this dispatch resolved before
   * planning. Recovery reuses it, so a restart never resolves different models.
   */
  project?: OrchestratorProjectContext;
  kind: 'workflow' | 'room';
  destination: DispatchDestination | null;
  startedAt: string;
  /** The start budget promised to this dispatch, sized when it was reserved. */
  allocatedUsd?: number;
}

export type ProjectRunKind = 'initial' | 'maintenance';

/**
 * How a run ended. Only `delivered` and `no-work-needed` are outcomes the
 * runtime has evidence for; the others stay visibly unfinished.
 */
export type ProjectRunOutcome =
  | 'in-progress'
  | 'delivered'
  | 'no-work-needed'
  | 'stopped'
  | 'blocked'
  | 'incomplete';

/**
 * One objective's run: the initial delivery, or a later maintenance objective.
 * Detailed spans live in the profile-local run journal, never here and never in
 * the index, so the hot project list stays small.
 */
export interface ProjectRun {
  id: string;
  kind: ProjectRunKind;
  /** The maintenance objective or event this run answers. Null for the initial run. */
  objectiveId: string | null;
  startedAt: string;
  /** Null while the run is open. Retries, pause/resume and restart keep the identity. */
  endedAt: string | null;
  outcome: ProjectRunOutcome;
  /** Another run that belongs together with this one, or that one objective split into. */
  linkedRunIds?: string[];
  /** Shared activities charged once and linked from this run. Never a guessed share. */
  sharedActivityIds?: string[];
  /** Runs whose coalesced cause this objective reused instead of opening a new one. */
  coalescedFrom?: string[];
}

export interface Milestone {
  /** Objective that owns this milestone, including before dispatch. */
  runId?: string;
  id: string;
  title: string;
  /** An OpenSpec change in the project repository, owned by this milestone. */
  openSpecChange?: string;
  status: MilestoneStatus;
  plan: string | null;
  /** A preview milestone must close with a smoke check and a capture. */
  preview: { route: string } | null;
  dispatch: MilestoneDispatch | null;
  /** Work the owner does itself. Absent on delegated milestones and older records. */
  direct?: DirectExecution;
  /** Earlier executions the current one replaced, kept as history. */
  directHistory?: DirectExecution[];
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
  | { kind: 'cap'; capUsd: number }
  | { kind: 'room-time'; target: string; maxMinutes: number }
  | { kind: 'workflow-budget'; milestoneId: string; maxCostUsd: number }
  /** A research Room's planner asked a question the runtime can answer by widening access. */
  | { kind: 'research-access'; researchId: string };

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

// Split into research-record.ts (500-LOC limit); re-exported for existing imports.
import type { PendingEvidence, PendingResearch, ResearchResult } from './research-record';
export type { PendingEvidence, PendingResearch, ResearchResult } from './research-record';

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

export interface HistorySubject {
  /** Which record the entry is about. The kind also decides the link, if any. */
  kind: 'milestone' | 'workflow' | 'room' | 'decision';
  id: string;
  /**
   * The subject's name, saved where the writer held it. Null when the writer
   * holds no name, in which case the view falls back to the cause alone.
   */
  label: string | null;
}

export interface HistoryEntry {
  at: string;
  phase: ArchitectPhase;
  overlay: ArchitectOverlay | null;
  cause: string;
  /** What the entry is about. Absent on entries written before this change. */
  subject?: HistorySubject;
  /** The long note, question or reason, folded under the entry. */
  detail?: string;
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
  /** The skills the host approved. Approval only; the session loads none of them at start. */
  grantedSkills?: string[];
  model: string | null;
  thinking: string | null;
  /**
   * Which rule chose the owner's model, and the tier it outranks.
   *
   * The project models page used to state the owner's model in a sentence
   * under the tier table, with a second sentence saying a pin "outranks the
   * MED tier" whether or not one existed. The owner is a row of that table
   * now, and these are the two columns it fills.
   *
   * Absent on records written before this existed.
   */
  modelSource?: SelectionSource | null;
  modelOutranks?: ModelTier | null;
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
  /** Architect-level opt-in for later OpenSpec changes. */
  openSpecEnabled?: boolean;
  /** Absent on older projects until the user saves the execution setting. */
  executionMode?: ExecutionMode;
  /** Admin selections shown before work approval; refreshed by the owner runtime. */
  modelTiers?: SharedModelTierSettings;
  /** Project tier overrides. An absent tier inherits the global selection. Absent on older projects. */
  modelOverrides?: SharedModelTierSettings;
  /** Increments on each saved override, so an operation can record the revision it resolved. */
  modelConfigRevision?: number;
  /** Run identity per objective. Absent on older projects, which stay readable. */
  runs?: ProjectRun[];
  /**
   * What the user asked for and allowed. Absent on a project made under the
   * charter flow, which is deprecated: such a record is read as it is, keeps
   * its saved charter gates, and is never given an agreement on load.
   */
  agreement?: DeliveryAgreement;
  /** The Architect's current reading of the work. It grants nothing. */
  working?: WorkingInterpretation;
  /** Short sentences for the overview. Display only. */
  overview?: OverviewSummary;
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
  maintenanceProject?: OrchestratorProjectContext;
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
  /**
   * Why the Architect blocked on delegated work, as named fields. Absent on a
   * block from another cause, and on records written before this existed.
   *
   * `blockedReason` alone used to carry all of this inside one sentence, which
   * a reader then had to parse back out: the project page showed a Room by its
   * id because the title was never saved, and the reason a Room could not run
   * commands was findable only among the project's history entries.
   */
  blockedOn?: BlockedWork | null;
  /** Observable waits the owner registered. Absent on records saved before waits existed. */
  waits?: WaitRegistration[];
  /** Bumped by a stop. A wait registered before the bump is stale. Absent counts as 0. */
  controlRevision?: number;
}

export type { BlockedWork, BlockedWorkCause } from './blocked-work';

export interface NewProjectInput {
  executionMode?: ExecutionMode;
  openSpecEnabled?: boolean;
  id: string;
  name: string;
  idea: string;
  folder: string;
  /** Set when the project starts on a workspace that already exists. */
  workspaceId?: string | null;
  /** The start cap. Its presence makes this an agreement project. */
  capUsd?: number;
  now: string;
}

export function createProjectRecord(input: NewProjectInput): ProjectRecord {
  return {
    version: 1,
    openSpecEnabled: input.openSpecEnabled ?? false,
    executionMode: input.executionMode ?? 'workspace',
    id: input.id,
    name: input.name,
    idea: input.idea,
    folder: input.folder,
    workspaceId: input.workspaceId ?? null,
    createdAt: input.now,
    updatedAt: input.now,
    phase: 'intake',
    overlay: null,
    stateLine: 'Setting up the workspace.',
    brief: null,
    charter: null,
    // An agreement project continues on its own inside its approved limits. The
    // saved word is the charter flow's; it is not shown as a mode.
    autonomy: input.capUsd === undefined ? 'milestones' : 'charter-only',
    ...(input.capUsd === undefined ? {} : {
      agreement: { revision: 1, capUsd: input.capUsd, proposedAt: input.now, approvedAt: null, authority: null },
    }),
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

/** The summary sentences alone. Sources and times stay on the record. */
function overviewTexts(overview: OverviewSummary): Partial<Record<keyof OverviewSummary, string>> {
  return Object.fromEntries(Object.entries(overview).map(([field, summary]) => [field, summary.text]));
}

/**
 * The index row the UI, the widget and the management tool read. Derived, never
 * edited by hand.
 *
 * `activity` is derived here rather than written by the owner, and the owner's
 * own sentence stays on the record for the project page's "What Architect
 * reported" disclosure.
 */
export function toIndexEntry(
  record: ProjectRecord,
  options: { sessionStartedAt: string; runtimeRunning: boolean },
): import('./types').ArchitectIndexEntry {
  return {
    id: record.id,
    name: record.name,
    workspaceId: record.workspaceId,
    phase: record.phase,
    overlay: record.overlay,
    activity: projectActivity(record, options),
    milestones: milestoneCounts(record),
    spentUsd: record.budget.spentUsd,
    usageIncomplete: record.budget.incomplete !== false,
    capUsd: record.budget.capUsd,
    needsYou: needsYouCount(record),
    updatedAt: record.updatedAt,
    flow: record.agreement ? 'agreement' : 'charter',
    ...(record.overview ? { overview: overviewTexts(record.overview) } : {}),
  };
}
