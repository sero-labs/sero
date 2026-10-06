/**
 * The `architect` tool surface: the owner session's only way to act outside
 * the workspace files. Flat, because it travels as `sero architect --action
 * <name> --projectId <id> ...` through the CLI bridge.
 */

import type { OverviewField, SummarySource } from './agreement';
import type { AutonomySetting } from './record';

export const OWNER_ACTIONS = [
  'brief',
  'charter',
  'working',
  'summary',
  'milestone',
  'decide',
  'research',
  'openspec',
  'dispatch',
  'work',
  'control',
  'evidence',
  'status',
  'reply',
  'blocked',
  'sleep',
] as const;

export type OwnerAction = (typeof OWNER_ACTIONS)[number];

/**
 * The calls that end a wake explicitly. A status update alone does not.
 * `work` ends one only with `--operation continue` or `--operation wait`.
 */
export const OUTCOME_ACTIONS: readonly OwnerAction[] = ['sleep', 'decide', 'blocked'];

export const DISPATCH_KINDS = ['workflow', 'room'] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

/** Destinations a release may use directly: nothing leaves Sero or the repo. */
export const INTERNAL_DESTINATIONS = ['pr', 'workspace-files', 'saved-artifact', 'email-draft'] as const;
/** Destinations that send outside; each needs a user decision before any send. */
export const EXTERNAL_DESTINATIONS = ['email-send', 'chat-post', 'webhook-post'] as const;
export const DISPATCH_DESTINATIONS = [...INTERNAL_DESTINATIONS, ...EXTERNAL_DESTINATIONS] as const;
export type DispatchDestination = (typeof DISPATCH_DESTINATIONS)[number];

/**
 * Parameter names an evidence call must never carry. Evidence is produced by
 * the runtime; a call that arrives with any of these is a claim dressed as
 * evidence and is refused whole.
 */
export const EVIDENCE_RESERVED_KEYS = [
  'exitCode',
  'exit_code',
  'capture',
  'capturePath',
  'screenshot',
  'diffSummary',
  'diff',
  'output',
  'passed',
] as const;

export interface OwnerActionInput {
  action: OwnerAction;
  projectId: string;
  /** brief, status, reply, blocked, sleep: the text. */
  text?: string;
  /** Maintenance objective for a new milestone or a no-work-needed sleep. */
  runId?: string;
  noWorkNeeded?: boolean;
  title?: string;
  milestoneId?: string;
  plan?: string;
  previewRoute?: string;
  /** milestone: accept a verifying milestone on its evidence. */
  done?: boolean;
  /** charter: JSON `[{"title":"...","plan":"..."}]`; previewRoute is optional for browser milestones. */
  milestonesJson?: string;
  escalationPolicy?: string;
  autonomy?: AutonomySetting;
  capUsd?: number;
  /** working: what the work must achieve, and how. A field left out keeps its value. */
  objective?: string;
  approach?: string;
  /** working: JSON `["..."]`. */
  assumptionsJson?: string;
  /** working: JSON `[{"id":"c1","text":"...","userStated":true}]`. */
  criteriaJson?: string;
  /** summary: which overview sentence, and the work it is about. */
  field?: OverviewField;
  sourceKind?: SummarySource['kind'];
  sourceId?: string;
  /** decide */
  question?: string;
  /** decide: JSON `[{"id":"a","label":"...","consequence":"..."}]`. */
  optionsJson?: string;
  recommendation?: string;
  reason?: string;
  /** decide: milestone ids to park. */
  parks?: string[];
  /** research */
  stoppingCondition?: string;
  /** openspec: read the official CLI instructions/status or validate a linked change. */
  changeName?: string;
  operation?: 'status' | 'instructions' | 'validate' | 'pause' | 'resume' | 'retry' | 'cancel' | 'begin' | 'continue' | 'report' | 'wait';
  /** work continue/report: the execution the call is for. */
  executionId?: string;
  /** work wait: what the wait watches. Only `child` is monitored today. */
  source?: string;
  /** work wait: end the wait as expired after this many minutes. */
  deadlineMinutes?: number;
  /** control: the milestone id or research id whose linked work is controlled. */
  target?: string;
  /** control resume: a new total working-time limit, which the user must approve. */
  maxMinutes?: number;
  artifact?: 'proposal' | 'specs' | 'design' | 'tasks' | 'apply';
  /** research: the researchers must run commands (tests, builds). Requires `kind: 'room'`. */
  needsCommands?: boolean;
  /** dispatch */
  kind?: DispatchKind;
  prompt?: string;
  /** dispatch: where a release run delivers. An external destination becomes a decision. */
  destination?: DispatchDestination;
  /** dispatch: what the run may spend. More than the remaining budget becomes a decision. */
  maxCostUsd?: number;
  /** evidence: the ids of the working criteria this check covers. */
  criteria?: string[];
  /** evidence: the commands to run, one per entry. */
  commands?: string[];
  route?: string;
  /** reply */
  directiveId?: string;
  /** Parameter names on the call that the schema does not define. */
  extraKeys?: string[];
}

export interface OwnerActionOutcome {
  ok: boolean;
  text: string;
  details?: Record<string, unknown>;
}

/** What the runtime knows about the caller. Never a declared identity. */
export interface OwnerCallerSignals {
  sessionPath: string | null;
  cwd: string | null;
}
