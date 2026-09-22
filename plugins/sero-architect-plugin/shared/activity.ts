// The project's activity, derived from its record on every write.
//
// It replaces `stateLine`, the sentence the owner model wrote about itself: a
// sentence is never re-checked, so "Working on M2" outlived its Workflow by
// three days. Everything here is computed from saved fields, and `working` is
// reachable only through a dispatch this session watched report.
//
// Times stay as timestamps. The index is written once and read for days, so a
// rendered "5 days ago" inside it would freeze; the UI formats them at render.

import { isLive, type ActivityState } from '@sero-ai/common';
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

/** Milestones the verification gate accepted, and how many there are in total. */
export function milestoneCounts(record: ProjectRecord): { accepted: number; total: number } {
  const counted = record.milestones.filter((m) => m.id !== MAINTENANCE_MILESTONE_ID);
  const accepted = counted.filter((m) => m.verification === 'accepted' || m.verification === 'delivered').length;
  return { accepted, total: counted.length };
}

function maintenance(record: ProjectRecord): Milestone | undefined {
  return record.milestones.find((m) => m.id === MAINTENANCE_MILESTONE_ID);
}

/** The milestone the project is working, stopped on, or last dispatched. */
function currentMilestone(record: ProjectRecord): Milestone | undefined {
  const working = record.milestones.find((m) => m.id !== MAINTENANCE_MILESTONE_ID && (m.status === 'running' || m.status === 'verifying'));
  if (working) return working;
  return record.milestones.find((m) => m.id !== MAINTENANCE_MILESTONE_ID && m.dispatch?.failure);
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

/**
 * The project's activity.
 *
 * Order is what matters to the reader, not what the record happens to hold:
 * what needs the user, then what stopped, then what is running, then what is
 * armed. `working` comes last of the run states because it is the only one that
 * has to be earned with an observed report.
 */
export function projectActivity(
  record: ProjectRecord,
  options: { sessionStartedAt: string; runtimeRunning: boolean },
): ProjectActivity {
  const { sessionStartedAt, runtimeRunning } = options;
  const suffix = ownerSuffix(record, runtimeRunning);
  const maint = maintenance(record);
  const current = currentMilestone(record);
  const decisions = openDecisions(record);

  // A Room or Workflow that stopped and asked the user something.
  const waitingRoom = record.milestones.find(
    (m) => m.dispatch?.kind === 'room' && m.status === 'running' && m.dispatch.failure,
  );

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
    return {
      state: 'paused',
      headline: 'Paused by you',
      owner: armed
        ? 'Maintenance Workflow paused with the project'
        : 'Nothing runs until you resume',
      ownerAt: armed?.lastRunAt,
      ownerSuffix: undefined,
    };
  }

  // Nobody updates the liveness mark while the Architect runtime is off, so a
  // mark it wrote earlier in this session cannot prove a run is reporting now.
  const live = runtimeRunning && current?.dispatch && isLive(
    current.dispatch.observedLiveAt
      ? { runId: current.dispatch.runId ?? current.dispatch.id, startedAt: current.dispatch.dispatchedAt, reportedAt: current.dispatch.observedLiveAt }
      : undefined,
    sessionStartedAt,
  );

  if (current?.dispatch && live) {
    return {
      state: 'working',
      headline: `Working on ${current.title}`,
      owner: `${dispatchWord(current)} is running`,
      ownerAt: current.dispatch.observedLiveAt,
      ownerSuffix: suffix,
    };
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
    if (counts.total > 0 && counts.accepted === counts.total) {
      return {
        state: 'complete',
        headline: `${counts.accepted} of ${counts.total} milestones accepted`,
        owner: 'Nothing is running',
        ownerSuffix: suffix,
      };
    }
  }

  return {
    state: 'idle',
    headline: runtimeRunning ? 'Nothing is running' : 'Last known: nothing was running',
    owner: 'Architect has nothing queued',
    ownerSuffix: suffix,
  };
}
