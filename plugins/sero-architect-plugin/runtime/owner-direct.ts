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
  reportDirectExecution,
  type BeginDirectResult,
} from '../shared/direct-execution';
import { appendHistory, mayDispatch, settle } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { ProjectRecord } from '../shared/record';
import { projectWriter } from './execution-location';
import { mutateRecord, type RecordStore } from './record-store';
import type { TurnOutcomes } from './turn-outcomes';

export interface OwnerDirectDeps {
  store: RecordStore;
  outcomes: TurnOutcomes;
  newId(prefix: string): string;
  /** HEAD and a hash of the project content, read from the project folder. */
  workspaceState?: (record: ProjectRecord) => Promise<{ commit: string; fingerprint: string }>;
}

const ok = (text: string, details: Record<string, unknown> = {}): OwnerActionOutcome => ({ ok: true, text, details });
const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

/** Why the owner may not start a milestone itself now, or null when it may. */
function beginRefusal(record: ProjectRecord, milestoneId: string): OwnerActionOutcome | null {
  if (!hasAgreement(record)) return refuse('The Architect works on a milestone itself only in a project started with an agreement. This project uses the charter flow: dispatch the milestone.');
  // The owner's access covers the project folder and nothing else, so it
  // cannot work in a worktree. It must not edit the root in its place.
  if (record.executionMode !== 'workspace') return refuse('This project runs work in worktrees, and your access covers the project folder only. Dispatch the milestone as a Workflow or Room.');
  if (!mayDispatch(record)) return refuse(record.overlay ? `The project is ${record.overlay}; no new work may start.` : `Work starts during build, release or maintain, and the project is in ${record.phase}.`);
  const milestone = record.milestones.find((item) => item.id === milestoneId);
  if (!milestone) return refuse(`Milestone "${milestoneId}" is not on this project.`);
  if (milestone.openSpecChange) return refuse('An OpenSpec change is implemented by a Workflow. Dispatch this milestone.');
  if (milestone.status === 'planned' && record.autonomy === 'milestones') return refuse(`Milestone ${milestone.id} needs the user's approval of its plan first.`);
  const busy = projectWriter(record, milestone.id);
  if (busy || record.pendingEvidence?.length) return ok(`The project folder is in use${busy ? ` by ${busy.id}` : ' for verification'}. No work was started. Call sleep and wait for that work to finish.`);
  return null;
}

export async function ownerWork(deps: OwnerDirectDeps, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
  const { store, outcomes } = deps;
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
    // Read before the queued write: it runs git.
    const state = await readState(record);
    const begun = await apply((fresh) => {
      // The record may have moved while git ran, so the checks run on it again.
      const late = beginRefusal(fresh, milestoneId);
      if (late) return { ok: false, reason: late.text };
      return beginDirectExecution(fresh, milestoneId, {
        id: deps.newId('exec'),
        now,
        placement: { mode: 'workspace', directory: fresh.folder, workspaceId: fresh.workspaceId },
        baseCommit: state.commit,
        baseFingerprint: state.fingerprint,
      });
    }, 'Architect started work on it');
    if (!begun.ok) return refuse(begun.reason);
    const { execution } = begun;
    return ok(`${begun.created ? 'Work is recorded as started' : 'This work is already recorded'} for milestone ${milestoneId}: execution ${execution.id}, in ${execution.placement.directory}, from commit ${execution.baseCommit ?? 'none'}. Do the work with your own tools. If it needs another turn, end the wake with work --operation continue. When it is complete, call work --operation report --executionId ${execution.id}.`, {
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
    const state = await readState(record);
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
    const reported = await apply((fresh) => {
      const result = reportDirectExecution(fresh, active.id, executionId, summary, now);
      if (!result.ok || input.destination !== 'workspace-files') return result;
      // The files are already in the project folder, which is the receipt for
      // this destination. Acceptance stays a separate step.
      const directory = result.execution.placement.directory;
      return { ...result, record: { ...result.record, milestones: result.record.milestones.map((item) => (item.id === active.id ? { ...item, receipt: directory } : item)) } };
    }, 'Architect reported its work complete');
    if (!reported.ok) return refuse(reported.reason);
    return ok(`Your report for milestone ${active.id} is recorded as a claim. The milestone is verifying. Ask for evidence with the evidence action; it closes only on passed evidence.`, { milestoneId: active.id, executionId });
  }

  return refuse('operation is required: begin, continue or report.');
}
