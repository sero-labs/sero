/**
 * The `architect` tool surface: the owner session's only way to act outside
 * the workspace files. Flat, because it travels as `sero architect --action
 * <name> --projectId <id> ...` through the CLI bridge.
 */

import type { AutonomySetting } from './record';

export const OWNER_ACTIONS = [
  'brief',
  'charter',
  'milestone',
  'decide',
  'research',
  'dispatch',
  'evidence',
  'status',
  'reply',
  'blocked',
  'sleep',
] as const;

export type OwnerAction = (typeof OWNER_ACTIONS)[number];

/** The three calls that end a wake explicitly. A status update alone does not. */
export const OUTCOME_ACTIONS: readonly OwnerAction[] = ['sleep', 'decide', 'blocked'];

export const DISPATCH_KINDS = ['workflow', 'room'] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

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
  title?: string;
  milestoneId?: string;
  plan?: string;
  previewRoute?: string;
  /** milestone: accept a verifying milestone on its evidence. */
  done?: boolean;
  /** charter: JSON `[{"title":"...","plan":"...","previewRoute":"/"}]`. */
  milestonesJson?: string;
  escalationPolicy?: string;
  autonomy?: AutonomySetting;
  capUsd?: number;
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
  /** dispatch */
  kind?: DispatchKind;
  prompt?: string;
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
