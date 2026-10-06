/**
 * The `work` action: the owner does a milestone itself.
 *
 * `begin` saves an execution identity before any file changes. `continue` ends
 * a wake and asks for another turn on the same work. `report` records the
 * owner's completion claim, which evidence then has to prove.
 *
 * The owner's own tools do the work. Nothing here runs a command for it, and
 * nothing here accepts a result.
 */

import { hasAgreement } from '../shared/agreement';
import {
  activeDirectMilestone,
  beginDirectExecution,
  continueDirectExecution,
  currentDirect,
  isActiveDirect,
  reportDirectExecution,
  worktreeWorkRule,
  type BeginDirectResult,
  type DirectExecution,
} from '../shared/direct-execution';
import { appendHistory, mayDispatch, settle } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { ProjectRecord } from '../shared/record';
import type { DirectWorktrees } from './direct-worktree';
import { projectWriter } from './execution-location';
import { mutateRecord, type RecordStore } from './record-store';
import { ownerWait } from './owner-wait';
import type { TurnOutcomes } from './turn-outcomes';
import type { WaitReconciler } from './wait-reconciler';

export interface OwnerDirectDeps {
  store: RecordStore;
  outcomes: TurnOutcomes;
  newId(prefix: string): string;
  /** Observes the waits the owner registers. Absent in a runtime that cannot. */
  waits?: Pick<WaitReconciler, 'reconcile'>;
  /** HEAD and a hash of the content in a directory: the project folder, or a worktree. */
  workspaceState?: (record: ProjectRecord, directory?: string) => Promise<{ commit: string; fingerprint: string }>;
  /** The checkouts of Worktree projects. Absent in a runtime that cannot make them. */
  worktrees?: DirectWorktrees;
}

const ok = (text: string, details: Record<string, unknown> = {}): OwnerActionOutcome => ({ ok: true, text, details });
const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

/** Why the owner may not start a milestone itself now, or null when it may. */
function beginRefusal(record: ProjectRecord, milestoneId: string): OwnerActionOutcome | null {
  if (!hasAgreement(record)) return refuse('The Architect works on a milestone itself only in a project started with an agreement. This project uses the charter flow: dispatch the milestone.');
  if (!record.executionMode) return refuse('Choose Workspace or Worktree in project settings before starting new work.');
  if (!mayDispatch(record)) return refuse(record.overlay ? `The project is ${record.overlay}; no new work may start.` : `Work starts during build, release or maintain, and the project is in ${record.phase}.`);
  const milestone = record.milestones.find((item) => item.id === milestoneId);
  if (!milestone) return refuse(`Milestone "${milestoneId}" is not on this project.`);
  if (milestone.openSpecChange) return refuse('An OpenSpec change is implemented by a Workflow. Dispatch this milestone.');
  if (milestone.status === 'planned' && record.autonomy === 'milestones') return refuse(`Milestone ${milestone.id} needs the user's approval of its plan first.`);
  if (record.executionMode === 'worktree') {
    // The milestone has a checkout of its own, so the project folder's writers
    // do not matter. Two executions at once would still be two owners' work.
    const other = activeDirectMilestone(record);
    return other && other.id !== milestone.id ? ok(`You are already working on ${other.id} yourself. No work was started. Report it or park it first.`) : null;
  }
  const busy = projectWriter(record, milestone.id);
  if (busy || record.pendingEvidence?.length) return ok(`The project folder is in use${busy ? ` by ${busy.id}` : ' for verification'}. No work was started. Call sleep and wait for that work to finish.`);
  return null;
}

export async function ownerWork(deps: OwnerDirectDeps, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
  const { store, outcomes } = deps;
  if (input.operation === 'wait') return ownerWait(deps, record, input, now);
  const readState = deps.workspaceState;
  if (!readState) return refuse('This runtime cannot read the project folder state, so the Architect cannot work on a milestone itself. Dispatch it.');
  const apply = async (change: (fresh: ProjectRecord) => BeginDirectResult, cause?: string): Promise<BeginDirectResult> => {
    let result: BeginDirectResult = { ok: false, reason: 'The project record is gone.' };
    await mutateRecord(store, record.id, (fresh) => {
      const changed = change(fresh);
      result = changed;
      if (!changed.ok) return { error: changed.reason };
      if (changed.record === fresh) return { record: fresh };
      const milestone = changed.record.milestones.find((item) => item.direct?.id === changed.execution.id);
      const saved = cause && milestone ? appendHistory(changed.record, now, cause, { kind: 'milestone', id: milestone.id, label: milestone.title }) : changed.record;
      return { record: settle(saved, now) };
    });
    return result;
  };

  if (input.operation === 'begin') {
    if (!input.milestoneId) return refuse('milestoneId is required.');
    const milestoneId = input.milestoneId;
    const early = beginRefusal(record, milestoneId);
    if (early) return early;
    // Git runs before the queued write. A worktree is made first and saved with
    // the execution, so a restart finds both. A failure saves nothing.
    const milestone = record.milestones.find((item) => item.id === milestoneId);
    const saved = milestone?.direct;
    const same = isActiveDirect(saved) && saved.requirementRevision === (record.working?.revision ?? null);
    let opened: Awaited<ReturnType<DirectWorktrees['open']>> | null = null;
    if (milestone && record.executionMode === 'worktree' && !same) {
      if (!deps.worktrees) return refuse('This runtime cannot make worktrees, so the Architect cannot work on a milestone itself in this project. Dispatch it.');
      opened = await deps.worktrees.open(record, milestone);
      if (!opened.ok) return refuse(opened.reason);
    }
    const placement: DirectExecution['placement'] = opened?.placement ?? { mode: record.executionMode ?? 'workspace', directory: record.folder, workspaceId: record.workspaceId };
    const state = await readState(record, placement.directory);
    const begun = await apply((fresh) => {
      // The record may have moved while git ran, so the checks run on it again.
      const late = beginRefusal(fresh, milestoneId);
      if (late) return { ok: false, reason: late.text };
      return beginDirectExecution(fresh, milestoneId, {
        id: deps.newId('exec'),
        now,
        placement,
        baseCommit: state.commit,
        baseFingerprint: state.fingerprint,
      });
    }, 'Architect started work on it');
    if (!begun.ok) return refuse(begun.reason);
    const { execution } = begun;
    const where = execution.placement.mode === 'worktree' ? ` ${opened?.ok && begun.created ? `${opened.note} ` : ''}${worktreeWorkRule(execution.placement)}` : '';
    return ok(`${begun.created ? 'Work is recorded as started' : 'This work is already recorded'} for milestone ${milestoneId}: execution ${execution.id}, in ${execution.placement.directory}, from commit ${execution.baseCommit ?? 'none'}.${where} Do the work with your own tools. If it needs another turn, end the wake with work --operation continue. When it is complete, call work --operation report --executionId ${execution.id}.`, {
      milestoneId, executionId: execution.id,
    });
  }

  const active = input.milestoneId
    ? record.milestones.find((item) => item.id === input.milestoneId)
    : activeDirectMilestone(record);
  if (!active?.direct) return refuse('No milestone has work you started yourself. Begin one with work --operation begin --milestoneId <id>.');
  const executionId = input.executionId ?? active.direct.id;

  if (input.operation === 'continue') {
    const unanswered = record.directives.find((directive) => directive.reply === null);
    if (unanswered) return refuse(`Reply to directive ${unanswered.id} before you continue.`);
    let directory = active.direct.placement.directory;
    if (active.direct.placement.mode === 'worktree') {
      if (!deps.worktrees) return refuse('This runtime cannot reach worktrees, so this work cannot continue.');
      const found = await deps.worktrees.ensure(record, active, active.direct.placement);
      if (!found.ok) return refuse(found.reason);
      directory = found.placement.directory;
    }
    const state = await readState(record, directory);
    const continued = await apply((fresh) => continueDirectExecution(fresh, active.id, executionId, state.fingerprint));
    if (!continued.ok) return refuse(continued.reason);
    outcomes.declare(record.id, 'continue');
    return ok(`Recorded. You are woken again to continue milestone ${active.id} if the project may still start work. This wake is over.`, { milestoneId: active.id, executionId });
  }

  if (input.operation === 'report') {
    if (!input.executionId) return refuse('executionId is required: the execution this report is for.');
    const summary = input.text?.trim();
    if (!summary) return refuse('text is required: what you completed.');
    if (input.destination && input.destination !== 'workspace-files') return refuse(`Your own work delivers to workspace-files only. Dispatch a delivery to ${input.destination}.`);
    const current = currentDirect(active, executionId);
    const placement = current?.placement;
    if (placement?.mode === 'worktree') {
      // A checkpoint failure refuses the report: the branch must hold the work
      // the evidence will diff, and the execution stays running.
      if (!deps.worktrees) return refuse('This runtime cannot reach worktrees, so this work cannot be reported.');
      const found = await deps.worktrees.ensure(record, active, placement);
      const kept = found.ok ? await deps.worktrees.checkpoint(found.placement, `Architect: ${active.title}`) : found;
      if (!kept.ok) return refuse(`Your work in ${placement.directory} could not be committed to its branch: ${kept.reason}. The execution stays running; fix the cause and report again.`);
    }
    const reported = await apply((fresh) => {
      const result = reportDirectExecution(fresh, active.id, executionId, summary, now);
      if (!result.ok || input.destination !== 'workspace-files') return result;
      // In Workspace mode the files are already in the project folder, which is
      // the receipt for this destination. In Worktree mode the result is the
      // branch the checkpoint committed to. Acceptance stays a separate step.
      const { placement: where } = result.execution;
      const receipt = where.mode === 'worktree' ? where.branch ?? where.directory : where.directory;
      return { ...result, record: { ...result.record, milestones: result.record.milestones.map((item) => (item.id === active.id ? { ...item, receipt } : item)) } };
    }, 'Architect reported its work complete');
    if (!reported.ok) return refuse(reported.reason);
    return ok(`Your report for milestone ${active.id} is recorded as a claim. The milestone is verifying. Ask for evidence with the evidence action; it closes only on passed evidence.`, { milestoneId: active.id, executionId });
  }

  return refuse('operation is required: begin, continue, report or wait.');
}
