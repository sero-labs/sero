/**
 * Direct execution: a milestone the owner does itself, with no Workflow or Room.
 *
 * It has its own identity, saved before any tool can change a file, so a
 * restart finds the same execution instead of starting a second one. The
 * identity names what the work started from: the objective run, the owner
 * session, where the files are, the commit and content it began at, and the
 * requirement revision it answers.
 *
 * A completion report is a claim. It moves nothing past `reported`: evidence,
 * acceptance and delivery keep their own rules, the same ones delegated work
 * uses. A stop, a limit or an interruption is never a report.
 *
 * Records saved before this existed carry no execution. None is invented for
 * them on load.
 */

import type { ExecutionMode, Milestone, ProjectRecord } from './record';

/**
 * `running`      the owner is doing the work, across as many turns as it needs.
 * `reported`     the owner said it is complete. A claim, checked by evidence.
 * `interrupted`  a stop, limit or watchdog ended a turn. The work is resumable.
 * `superseded`   newer work for the milestone replaced it. History only.
 */
export type DirectExecutionState = 'running' | 'reported' | 'interrupted' | 'superseded';

export interface DirectExecution {
  id: string;
  /** The objective run this work belongs to. Late usage is charged to it. */
  runId: string | null;
  /** The owner session that does the work, as the record held it at the start. */
  owner: { subject: 'owner'; sessionId: string | null; sessionPath: string | null };
  /**
   * Where the files are. Resolved once, then reused on every resume. A
   * worktree execution also names its branch: that branch is the result.
   */
  placement: { mode: ExecutionMode; directory: string; workspaceId: string | null; branch?: string };
  /** HEAD before the first edit, for the diff the evidence shows. */
  baseCommit: string | null;
  /** Hash of the project content before the first edit. */
  baseFingerprint: string | null;
  /** The working revision the work answers. Null when no interpretation exists. */
  requirementRevision: number | null;
  state: DirectExecutionState;
  startedAt: string;
  /** The owner's completion claim, once made. */
  claim: { reportedAt: string; summary: string } | null;
  /** Why the last turn ended early, while `interrupted`. */
  interruption?: string;
  /** Turns the owner asked to continue with. */
  continuations: number;
  /** Continuations in a row that changed no file. Shown, never enforced. */
  idleContinuations: number;
  /** The content hash after the last turn, to tell whether the next one changed anything. */
  lastFingerprint?: string | null;
}

/** What the runtime resolves before an execution may start. */
export interface DirectExecutionStart {
  id: string;
  now: string;
  placement: DirectExecution['placement'];
  baseCommit: string | null;
  baseFingerprint: string | null;
}

/** An execution that still owns its milestone's files. */
export function isActiveDirect(execution: DirectExecution | undefined): execution is DirectExecution {
  return execution?.state === 'running' || execution?.state === 'interrupted';
}

/** The checkout a worktree execution works in, or null when the work is in the project folder. */
export function directWorktree(milestone: Milestone): DirectExecution['placement'] | null {
  const execution = milestone.direct;
  return execution && execution.state !== 'superseded' && execution.placement.mode === 'worktree' ? execution.placement : null;
}

/** Where the owner must work for a worktree execution. One wording for the reply and the per-wake contract. */
export function worktreeWorkRule(placement: DirectExecution['placement']): string {
  return `Your own work on this milestone is in the checkout ${placement.directory}${placement.branch ? ` (branch ${placement.branch})` : ''}. Every path you read, write or edit must be inside it: use absolute paths, or cd there first in each shell command. Do not edit the project folder for this milestone.`;
}

/** The milestone's execution when it is the current one, by id. */
export function currentDirect(milestone: Milestone, executionId: string): DirectExecution | null {
  const execution = milestone.direct;
  return execution && execution.id === executionId && execution.state !== 'superseded' ? execution : null;
}

export type BeginDirectResult =
  | { ok: true; record: ProjectRecord; execution: DirectExecution; created: boolean }
  | { ok: false; reason: string };

/**
 * Links a milestone to a new execution, or returns the one it already has.
 *
 * A repeated start, and a start replayed after a restart, get the saved
 * identity back and change nothing. A milestone with delegated work in flight
 * is refused: two writers on one milestone is the fault this guards.
 */
export function beginDirectExecution(record: ProjectRecord, milestoneId: string, start: DirectExecutionStart): BeginDirectResult {
  const milestone = record.milestones.find((item) => item.id === milestoneId);
  if (!milestone) return { ok: false, reason: `No milestone "${milestoneId}".` };
  const parked = parkedRefusal(milestone);
  if (parked) return { ok: false, reason: parked };
  const revision = record.working?.revision ?? null;
  // Work that still answers the current requirements is the same work. Work
  // that answers older ones is replaced below: it can no longer report.
  if (isActiveDirect(milestone.direct) && milestone.direct.requirementRevision === revision) return { ok: true, record, execution: milestone.direct, created: false };
  // A delegate that reported before the owner took over is finished. Direct
  // work sets the milestone running itself, so only the dispatch tells them apart.
  const delegateLive = milestone.dispatch && !milestone.dispatch.finishedAt && milestone.status === 'running';
  if (milestone.pendingDispatch || delegateLive) {
    return { ok: false, reason: `"${milestone.title}" already has delegated work running. Reconcile it before the Architect works on the milestone itself.` };
  }
  if (milestone.status === 'done' || milestone.status === 'parked') {
    return { ok: false, reason: `"${milestone.title}" is ${milestone.status === 'done' ? 'accepted' : 'parked'}, so no work starts on it.` };
  }

  const execution: DirectExecution = {
    id: start.id,
    runId: milestone.runId ?? record.runs?.findLast((run) => run.endedAt === null)?.id ?? null,
    owner: { subject: 'owner', sessionId: record.session.sessionId, sessionPath: record.session.sessionPath },
    placement: start.placement,
    baseCommit: start.baseCommit,
    baseFingerprint: start.baseFingerprint,
    requirementRevision: revision,
    state: 'running',
    startedAt: start.now,
    claim: null,
    continuations: 0,
    idleContinuations: 0,
    lastFingerprint: start.baseFingerprint,
  };
  // An earlier report for this milestone is history once new work starts, so
  // its evidence no longer describes the files: it is marked stale and the
  // verification state is cleared, so restart recovery sees a report to verify.
  // The replaced execution stays as history. Its files stay where they are: the
  // new execution starts from the state the caller read now.
  const history = milestone.direct ? [...(milestone.directHistory ?? []), { ...milestone.direct, state: 'superseded' as const }] : milestone.directHistory;
  const next: Milestone = { ...milestone, status: 'running', direct: execution, ...(history ? { directHistory: history } : {}), verification: null, ...(milestone.evidence ? { evidence: { ...milestone.evidence, stale: true } } : {}),
    ...(milestone.dispatch ? { dispatch: { ...milestone.dispatch, finishedAt: milestone.dispatch.finishedAt ?? start.now } } : {}) };
  return { ok: true, record: replaceMilestone(record, next), execution, created: true };
}

/**
 * Counts a continuation and whether it followed a turn that changed nothing.
 *
 * The count is information for the person watching. It stops nothing: a turn
 * spent reading code changes no file and is still useful work.
 */
export function continueDirectExecution(record: ProjectRecord, milestoneId: string, executionId: string, fingerprint: string | null): BeginDirectResult {
  const found = locate(record, milestoneId, executionId);
  if (typeof found === 'string') return { ok: false, reason: found };
  const { milestone, execution } = found;
  if (execution.state === 'reported') return { ok: false, reason: 'This work already reported completion. Request evidence, or begin again if more work is needed.' };
  const unchanged = fingerprint !== null && fingerprint === execution.lastFingerprint;
  const next: DirectExecution = {
    ...withoutInterruption(execution),
    state: 'running',
    continuations: execution.continuations + 1,
    idleContinuations: unchanged ? execution.idleContinuations + 1 : 0,
    lastFingerprint: fingerprint ?? execution.lastFingerprint ?? null,
  };
  return { ok: true, record: replaceMilestone(record, { ...milestone, direct: next }), execution: next, created: false };
}

/**
 * Records the owner's completion claim and moves the milestone to `verifying`.
 *
 * The claim must name the current execution and answer the current requirement
 * revision. A report from replaced work, or for requirements that changed
 * since it started, is refused and changes nothing.
 */
export function reportDirectExecution(record: ProjectRecord, milestoneId: string, executionId: string, summary: string, now: string): BeginDirectResult {
  const found = locate(record, milestoneId, executionId);
  if (typeof found === 'string') return { ok: false, reason: found };
  const { milestone, execution } = found;
  const revision = record.working?.revision ?? null;
  if (execution.requirementRevision !== revision) {
    return { ok: false, reason: `The requirements changed after this work started (revision ${execution.requirementRevision ?? 'none'}, now ${revision ?? 'none'}). Begin the milestone again against the current requirements.` };
  }
  const next: DirectExecution = { ...withoutInterruption(execution), state: 'reported', claim: { reportedAt: now, summary } };
  return {
    ok: true,
    record: replaceMilestone(record, { ...milestone, status: 'verifying', verification: 'reported', direct: next }),
    execution: next,
    created: false,
  };
}

/** Marks running work as stopped early. Never a report, and never evidence. */
export function interruptDirectExecutions(record: ProjectRecord, reason: string): ProjectRecord {
  if (!record.milestones.some((milestone) => milestone.direct?.state === 'running')) return record;
  return {
    ...record,
    milestones: record.milestones.map((milestone) => (milestone.direct?.state === 'running'
      ? { ...milestone, direct: { ...milestone.direct, state: 'interrupted' as const, interruption: reason } }
      : milestone)),
  };
}

/** The milestone the owner is working on itself, if any. One at a time. */
export function activeDirectMilestone(record: ProjectRecord): Milestone | undefined {
  return record.milestones.find((milestone) => isActiveDirect(milestone.direct));
}

function locate(record: ProjectRecord, milestoneId: string, executionId: string): { milestone: Milestone; execution: DirectExecution } | string {
  const milestone = record.milestones.find((item) => item.id === milestoneId);
  if (!milestone) return `No milestone "${milestoneId}".`;
  const execution = currentDirect(milestone, executionId);
  if (!execution) return `Execution "${executionId}" is not the current work for "${milestone.title}". Its report stays as history.`;
  return parkedRefusal(milestone) ?? { milestone, execution };
}

/** A milestone an unanswered decision parked takes no work and no report until the user answers. */
function parkedRefusal(milestone: Milestone): string | null {
  const decisions = milestone.parkedByDecisions?.length ? milestone.parkedByDecisions : milestone.parkedBy ? [milestone.parkedBy] : [];
  if (milestone.status !== 'parked' || decisions.length === 0) return null;
  return `"${milestone.title}" is parked by decision ${decisions.join(', ')}, which the user has not answered. No work starts, continues or reports on it until they do.`;
}

function withoutInterruption(execution: DirectExecution): DirectExecution {
  const { interruption: _cleared, ...rest } = execution;
  return rest;
}

function replaceMilestone(record: ProjectRecord, next: Milestone): ProjectRecord {
  return { ...record, milestones: record.milestones.map((item) => (item.id === next.id ? next : item)) };
}
