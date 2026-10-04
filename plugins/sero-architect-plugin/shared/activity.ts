// The project's activity, derived from its record on every write.
//
// It replaces `stateLine`, the sentence the owner model wrote about itself: a
// sentence is never re-checked, so "Working on M2" outlived its Workflow by
// three days. Everything here is computed from saved fields, and `working` is
// reachable only through a dispatch this session watched report.
//
// Times stay as timestamps. The index is written once and read for days, so a
// rendered "5 days ago" inside it would freeze; the UI formats them at render.

import { agreementApproved, hasAgreement } from './agreement';
import { isLive, type ActivityState, type FeedbackSummary } from '@sero-ai/common';
import type { Milestone, ProjectRecord } from './record';
import { openDecisions } from './record';
import { MAINTENANCE_MILESTONE_ID } from './maintenance';

export interface ProjectActivity {
  state: ActivityState;
  /** The first line: the state that matters most, in the user's words. */
  headline: string;
  /** The second line: whose work it is, without its time. */
  owner: string;
  /** The time that belongs with the owner line. */
  ownerAt?: string;
  /** What the owner itself is doing, e.g. "Architect idle". */
  ownerSuffix?: string;
  /** What the user must do. Absent when nothing is needed. */
  action?: string;
  /**
   * Why the work stopped, when the record saved a cause. The project page
   * gives it its own line; a cause is never invented to fill it.
   */
  reason?: string;
  /** The last saved report, for `last-known`. */
  lastReportAt?: string;
}

/** Milestones the verification gate accepted, or set aside, and how many there are in total. */
export function milestoneCounts(record: ProjectRecord): { accepted: number; total: number } {
  const counted = record.milestones.filter((m) => m.id !== MAINTENANCE_MILESTONE_ID);
  const accepted = counted.filter((m) => m.verification === 'accepted' || m.verification === 'delivered' || isSetAside(m)).length;
  return { accepted, total: counted.length };
}

function maintenance(record: ProjectRecord): Milestone | undefined {
  return record.milestones.find((m) => m.id === MAINTENANCE_MILESTONE_ID);
}

/** The milestone the project is working, stopped on, or last dispatched. */
function currentMilestone(record: ProjectRecord): Milestone | undefined {
  const working = record.milestones.find((m) => m.id !== MAINTENANCE_MILESTONE_ID && (m.status === 'running' || m.status === 'verifying'));
  if (working) return working;
  return record.milestones.find((m) => m.id !== MAINTENANCE_MILESTONE_ID && m.status !== 'parked' && m.dispatch?.failure);
}

/** What the owner itself is doing, for the end of the second line. */
function ownerSuffix(record: ProjectRecord, runtimeRunning: boolean): string {
  if (record.paused) return 'Architect paused by you';
  if (!runtimeRunning) return 'Architect is not running';
  if (record.session.workingSince) return 'Architect is taking a turn';
  return 'Architect idle';
}

/** The heading for a block on delegated work, from the state it ended in. */
function blockedHeadline(status: string): string {
  if (status === 'cancelled') return 'Research was cancelled before it reported';
  if (status === 'failed') return 'Research stopped before it reported';
  if (status === 'paused') return 'Research is paused and has not reported';
  return 'Research finished without saving findings';
}

function dispatchWord(milestone: Milestone): string {
  return milestone.dispatch?.kind === 'room' ? 'Room' : 'Workflow';
}

/** Research is visible before there are any implementation milestones. */
function researchActivity(record: ProjectRecord, sessionStartedAt: string, runtimeRunning: boolean, feedback?: FeedbackSummary | null): ProjectActivity | null {
  const pending = record.pendingResearch ?? [];
  const marked = runtimeRunning ? pending.find((entry) => isLive(entry.observedLiveAt
    ? { runId: entry.runId ?? entry.roomId ?? entry.workflowId ?? entry.id, startedAt: entry.startedAt, reportedAt: entry.observedLiveAt }
    : undefined, sessionStartedAt)) : undefined;
  // A producer attached now is observed work even before a record write says so.
  const live = marked ?? (runtimeRunning && (feedback?.activeCount ?? 0) > 0 ? pending[0] : undefined);
  const entry = live ?? pending[0];
  if (!entry) return null;
  const name = entry.kind === 'room' ? 'Room' : entry.kind === 'workflow' ? 'Workflow' : 'research agent';
  if (live) return {
    state: 'working', headline: 'Researching a project question',
    owner: entry.kind ? `${name} is running` : 'Research agent is running', ownerAt: live.observedLiveAt ?? feedback?.lastActivityAt ?? undefined,
  };
  if (entry.roomId || entry.workflowId || entry.runId || !runtimeRunning) return {
    state: 'last-known', headline: 'Last known: researching a project question',
    owner: `No live report from the ${name}`,
    ownerAt: entry.observedLiveAt ?? entry.startedAt, lastReportAt: entry.observedLiveAt ?? entry.startedAt,
  };
  return { state: 'idle', headline: 'Preparing research', owner: `Architect is preparing the ${entry.kind ? name : 'research task'}` };
}

/**
 * The project's activity.
 *
 * Order is what matters to the reader, not what the record happens to hold:
 * what needs the user, then what stopped, then what is running, then what is
 * armed. `working` comes last of the run states because it is the only one that
 * has to be earned with an observed report.
 */
/** A milestone the Architect set aside when its Room was cancelled. No decision holds it. */
export function isSetAside(milestone: Milestone): boolean {
  return milestone.status === 'parked' && !milestone.parkedBy;
}

function setAsideCount(record: ProjectRecord): number {
  return record.milestones.filter((m) => m.id !== MAINTENANCE_MILESTONE_ID && isSetAside(m)).length;
}

/** Milestones the gate accepted on passed evidence. A set-aside milestone proves nothing. */
function evidenceAccepted(record: ProjectRecord): number {
  return record.milestones.filter((m) => m.id !== MAINTENANCE_MILESTONE_ID && (m.verification === 'accepted' || m.verification === 'delivered')).length;
}

/**
 * Every milestone is closed, and at least one of them on passed evidence. A
 * milestone set aside when its Room stopped is closed, so it does not hold a
 * project open for ever; a project of nothing but set-aside work is not
 * delivered, because nothing was ever accepted.
 */
function deliveredAll(record: ProjectRecord): boolean {
  return evidenceAccepted(record) > 0 && everyMilestoneClosed(record);
}

/** "Delivered", or both facts when part of the plan was set aside. */
function deliveredHeadline(record: ProjectRecord): string {
  const counts = milestoneCounts(record);
  const aside = setAsideCount(record);
  return aside > 0 ? `${counts.accepted - aside} of ${counts.total} delivered, ${aside} set aside` : 'Delivered';
}

/**
 * True when nothing on the plan is still open: every milestone is done, or set
 * aside because its Room stopped. Shared by the paths that can close the last
 * open milestone, so the phase does not depend on which of them ran last.
 */
export function everyMilestoneClosed(record: ProjectRecord): boolean {
  return record.milestones.every((m) => m.id === MAINTENANCE_MILESTONE_ID || m.status === 'done' || isSetAside(m));
}

export function projectActivity(
  record: ProjectRecord,
  options: { sessionStartedAt: string; runtimeRunning: boolean; feedback?: FeedbackSummary | null },
): ProjectActivity {
  const { sessionStartedAt, runtimeRunning, feedback } = options;
  const suffix = ownerSuffix(record, runtimeRunning);
  const maint = maintenance(record);
  const current = currentMilestone(record);
  const decisions = openDecisions(record);

  // A Room or Workflow that stopped and asked the user something.
  const waitingRoom = record.milestones.find(
    (m) => m.dispatch?.kind === 'room' && m.status === 'running' && m.dispatch.failure,
  );

  // Nothing paid starts before the user approves the start. The control that
  // raises the approval again sits beside this line.
  if (hasAgreement(record) && !agreementApproved(record)) {
    return { state: 'idle', headline: 'Not started', owner: 'Access is not approved', action: 'Review access' };
  }

  if (record.budget.capUsd !== null && record.budget.spentUsd >= record.budget.capUsd) {
    return {
      state: 'stopped',
      headline: 'Stopped by the spend cap',
      owner: maint ? 'Maintenance Workflow cannot start until the cap is raised' : 'No paid work can start until the cap is raised',
      ownerSuffix: suffix,
      action: 'Raise the cap',
    };
  }

  if (waitingRoom?.dispatch) {
    return {
      state: 'waiting-for-you',
      headline: `Waiting for you in the Room ${waitingRoom.title}`,
      owner: waitingRoom.dispatch.failure ?? 'The Room stopped to ask you something',
      ownerAt: waitingRoom.dispatch.lastRunAt ?? waitingRoom.dispatch.dispatchedAt,
      ownerSuffix: suffix,
      action: 'Open the Room to answer',
    };
  }

  if (decisions.length > 0) {
    const first = decisions[0];
    return {
      state: 'waiting-for-you',
      headline: decisions.length === 1 ? first.question : `${decisions.length} decisions need you`,
      owner: 'Architect asked you to decide',
      ownerAt: first.raisedAt,
      ownerSuffix: suffix,
      action: decisions.length === 1 ? 'Answer the decision' : `Answer ${decisions.length} decisions`,
    };
  }

  const stopped = record.milestones.find((m) => m.dispatch?.failure);
  const cause = stopped?.dispatch?.failure;
  if (stopped?.dispatch && cause) {
    // The cause IS the activity line, beside the state glyph, the way the
    // drawing has it: "Sero restarted during step 1 of its Workflow · 10 days
    // ago". It is not a second sentence under that line, and the owner line no
    // longer repeats that the work stopped.
    return {
      state: 'stopped',
      headline: stopped.id === MAINTENANCE_MILESTONE_ID ? 'Maintenance stopped' : `${stopped.title} stopped`,
      owner: cause,
      ownerAt: stopped.dispatch.lastRunAt ?? stopped.dispatch.dispatchedAt,
      ownerSuffix: suffix,
      action: stopped.dispatch.retryStepId ? 'Retry the step' : 'Open the work to decide what next',
    };
  }

  // A block on delegated work knows what the work was called and what became
  // of it. A record written before those fields existed falls back to the
  // sentence below, which is why the heading used to be a Room id.
  if (record.blockedOn) {
    const work = record.blockedOn;
    const name = work.kind === 'room' ? 'Room' : 'Workflow';
    return {
      state: 'stopped',
      headline: blockedHeadline(work.status),
      owner: `${name} ${work.title ?? work.id} · ${work.status}`,
      ownerAt: work.at,
      ownerSuffix: suffix,
      ...(work.cause ? { reason: work.cause.text } : {}),
      action: 'Open the project to decide what next',
    };
  }

  if (record.blockedReason) {
    return {
      state: 'stopped',
      headline: record.blockedReason,
      owner: 'Architect stopped and cannot continue on its own',
      ownerSuffix: suffix,
      action: 'Open the project to decide what next',
    };
  }

  if (record.paused) {
    const armed = maint?.dispatch;
    // A pause lets the turns in flight finish. Until they do, the line says so.
    const finishing = runtimeRunning ? feedback?.activeCount ?? 0 : 0;
    return {
      state: 'paused',
      headline: 'Paused by you',
      owner: finishing > 0
        ? (finishing === 1 ? '1 turn is still finishing' : `${finishing} turns are still finishing`)
        : armed
        ? 'Maintenance Workflow paused with the project'
        : 'Nothing runs until you resume',
      ownerAt: armed?.lastRunAt,
      ownerSuffix: undefined,
    };
  }

  // Nobody updates the liveness mark while the Architect runtime is off, so a
  // mark it wrote earlier in this session cannot prove a run is reporting now.
  const live = runtimeRunning && current?.dispatch && (isLive(
    current.dispatch.observedLiveAt
      ? { runId: current.dispatch.runId ?? current.dispatch.id, startedAt: current.dispatch.dispatchedAt, reportedAt: current.dispatch.observedLiveAt }
      : undefined,
    sessionStartedAt,
  ) || (feedback?.activeCount ?? 0) > 0);

  if (current?.dispatch && live) {
    return {
      state: 'working',
      headline: `Working on ${current.title}`,
      owner: `${dispatchWord(current)} is running`,
      ownerAt: current.dispatch.observedLiveAt ?? feedback?.lastActivityAt ?? undefined,
      ownerSuffix: suffix,
    };
  }

  const research = researchActivity(record, sessionStartedAt, runtimeRunning, feedback);
  if (research) return { ...research, ownerSuffix: suffix };

  // The runtime accepted a dispatch and is preparing its Workflow or Room. The
  // record says so before any run exists to report, so the line does too.
  const preparing = record.milestones.find((m) => m.pendingDispatch && !m.dispatch);
  if (preparing?.pendingDispatch) {
    const at = preparing.pendingDispatch.startedAt;
    const name = preparing.pendingDispatch.kind === 'room' ? 'Room' : 'Workflow';
    return runtimeRunning && at >= sessionStartedAt
      ? { state: 'working', headline: `Starting ${preparing.title}`, owner: `${name} is being prepared`, ownerAt: at, ownerSuffix: suffix }
      : { state: 'last-known', headline: `Last known: starting ${preparing.title}`, owner: 'No report since', ownerAt: at, ownerSuffix: suffix, lastReportAt: at };
  }

  // The work reported and its result is being checked. That is the Architect's
  // own step, so it reads as work only while this session shows it at work.
  if (current?.status === 'verifying') {
    const turnSince = record.session.workingSince;
    const checking = runtimeRunning && ((turnSince != null && turnSince >= sessionStartedAt) || (feedback?.activeCount ?? 0) > 0);
    return checking
      ? { state: 'working', headline: `Checking ${current.title}`, owner: 'Architect is checking the result', ownerAt: turnSince ?? feedback?.lastActivityAt ?? undefined }
      : { state: 'last-known', headline: `Last known: checking ${current.title}`, owner: 'No report since', ownerAt: current.dispatch?.lastRunAt ?? current.dispatch?.dispatchedAt, ownerSuffix: suffix, lastReportAt: current.dispatch?.lastRunAt ?? current.dispatch?.dispatchedAt };
  }

  if (current?.dispatch) {
    const at = current.dispatch.lastRunAt ?? current.dispatch.dispatchedAt;
    return {
      state: 'last-known',
      headline: `Last known: working on ${current.title}`,
      owner: 'No report since',
      ownerAt: at,
      ownerSuffix: suffix,
      lastReportAt: at,
    };
  }

  // An agreement is one request. Once every part of it is accepted, that is the
  // news; the standing maintenance Workflow is the detail under it.
  if (hasAgreement(record) && record.phase === 'maintain' && deliveredAll(record)) {
    return {
      state: 'complete',
      headline: deliveredHeadline(record),
      owner: maint?.dispatch ? 'Maintenance is waiting for a trigger' : 'Nothing is running',
      ownerAt: maint?.dispatch?.lastRunAt,
      ownerSuffix: suffix,
    };
  }

  if (record.phase === 'maintain' && maint?.dispatch) {
    return {
      state: 'waiting-for-trigger',
      headline: 'Maintenance is waiting for a trigger',
      owner: 'Workflow last ran',
      ownerAt: maint.dispatch.lastRunAt,
      ownerSuffix: suffix,
    };
  }

  const counts = milestoneCounts(record);
  if (record.phase === 'maintain' || record.phase === 'release') {
    if (deliveredAll(record)) {
      return {
        state: 'complete',
        // Accepted work in release is not delivered yet: the release step has still to land.
        headline: hasAgreement(record) && record.phase === 'maintain' ? deliveredHeadline(record) : `${counts.accepted} of ${counts.total} milestones accepted`,
        owner: 'Nothing is running',
        ownerSuffix: suffix,
      };
    }
  }

  // The Architect's own turn, with nothing delegated yet. The mark is from this
  // session, so a turn that an earlier session left open does not read as work.
  const turnSince = record.session.workingSince;
  if (runtimeRunning && turnSince && turnSince >= sessionStartedAt) {
    return { state: 'working', headline: 'Architect is working', owner: 'Its turn started', ownerAt: turnSince };
  }

  return {
    state: 'idle',
    headline: runtimeRunning ? 'Nothing is running' : 'Last known: nothing was running',
    owner: 'Architect has nothing queued',
    ownerSuffix: suffix,
  };
}
