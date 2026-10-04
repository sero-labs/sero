/**
 * A Room's activity in the words of the shared vocabulary.
 *
 * The same rule as a Workflow's: `working` needs a live mark this session
 * wrote, so a Room left `running` by an interrupted session reads as last
 * known rather than claiming a team is at work.
 */

import {
  ACTIVITY_STATE_WORD,
  activityNextStep,
  isLive,
  type ActivityDetail,
  type ActivityState,
  type FeedbackSummary,
} from '@sero-ai/common';
import type { RoomSummary } from '../../shared/room-types';
import { activeTimeNote, elapsedActiveMs } from '../../shared/room-active-time';
import { formatMinutes, formatRelative } from './format';
import { freshness, roomCurrentWork } from './live-facts';

export interface RoomActivity {
  state: ActivityState;
  word: string;
  nextStep: string | null;
  /** How long it has waited on the user, e.g. "9 days". Only when it waits. */
  waitingFor?: string;
  /** What the user must do. Only when the Room asks for something. */
  action?: string;
  /** The word, then the actual work or wait: `Working · Adversary · bash`. */
  line: string;
  /** The actual work or wait alone, for the Room page header. Null when nothing is known. */
  work: string | null;
  /** The time and freshness facts: `12 min of 30 min active · Last activity 8s ago`. */
  facts: string | null;
  /** How fresh the observation is alone: `Last activity 8s ago`. For the Room page header. */
  freshness: string | null;
  /** The Room stopped because its active time reached the limit. Resume needs a larger total. */
  timeLimit: boolean;
}

const MINUTE_MS = 60_000;

/**
 * `12 min of 30 min active`: the same working time the Room header and the time
 * limit use. Null before the Room has started.
 */
function activeFacts(room: RoomSummary, nowMs: number): string | null {
  if (!room.startedAt) return null;
  const used = formatMinutes(elapsedActiveMs({ ...room, endedAt: null }, nowMs));
  const limit = room.maxWallClockMs ? ` of ${Math.round(room.maxWallClockMs / MINUTE_MS)} min` : '';
  const note = activeTimeNote(room);
  return `${used}${limit} active${note ? ` (${note.short})` : ''}`;
}

/** The hold is the active-time limit: paused, reported as a limit, and the used time reached it. */
function hitTimeLimit(room: RoomSummary, nowMs: number): boolean {
  if (room.status !== 'paused' || room.attention?.pause?.kind !== 'limit-reached' || !room.maxWallClockMs) return false;
  return elapsedActiveMs({ ...room, endedAt: null }, nowMs) >= room.maxWallClockMs;
}

function turnsFinishing(count: number): string {
  return count === 1 ? '1 turn is still finishing' : `${count} turns are still finishing`;
}

/** What the Room asks of the user, named by who asked and for what. */
function askedOf(room: RoomSummary): { action: string; at?: string } | undefined {
  const pause = room.attention?.pause;
  if (pause) return { action: 'Open the Room to decide what next', at: pause.at };
  const requests = room.attention?.requests ?? [];
  if (requests.length > 0) {
    const who = requests.length === 1
      ? requests[0].memberName
      : `${requests.length} members`;
    return { action: `Answer ${who} in the Room` };
  }
  const approvals = room.attention?.approvals ?? [];
  if (approvals.length > 0) {
    return {
      action: approvals.length === 1 ? `Review ${approvals[0].title}` : `Review ${approvals.length} approvals`,
      at: approvals[0].createdAt,
    };
  }
  return undefined;
}

/**
 * `feedback` is what the Room's members report now. A member in a turn is
 * observed work. `nowMs` times the open call and the age of the last activity,
 * so a caller that ticks passes its own clock.
 */
export function roomActivity(room: RoomSummary, sessionStartedAt: string, feedback?: FeedbackSummary, nowMs = Date.now()): RoomActivity {
  const members = `${room.memberCount} member${room.memberCount === 1 ? '' : 's'}`;
  const resolve = (
    state: ActivityState,
    detail: ActivityDetail = {},
    waitingFor?: string,
    action?: string,
    wording: { word?: string; work?: string | null; timeLimit?: boolean } = {},
  ): RoomActivity => {
    const nextStep = activityNextStep(state, detail);
    // A state that could not say what happens next was not earned.
    const earned = nextStep === null ? 'last-known' : state;
    const word = nextStep === null ? ACTIVITY_STATE_WORD['last-known'] : (wording.word ?? ACTIVITY_STATE_WORD[state]);
    const work = nextStep === null ? members : (wording.work ?? null);
    const freshFacts = freshness(feedback, earned, nowMs);
    const facts = [activeFacts(room, nowMs), freshFacts].filter((part): part is string => !!part).join(' · ') || null;
    const tail = [work, waitingFor].filter((part): part is string => !!part).join(' · ');
    return {
      state: earned,
      word,
      nextStep: nextStep ?? activityNextStep('last-known', { lastReport: formatRelative(room.updatedAt) }),
      ...(nextStep !== null && waitingFor ? { waitingFor } : {}),
      ...(nextStep !== null && action ? { action } : {}),
      line: tail ? `${word} · ${tail}` : word,
      work,
      facts,
      freshness: freshFacts,
      timeLimit: nextStep !== null && wording.timeLimit === true,
    };
  };

  if (room.status === 'completed') return resolve('complete', {}, undefined, undefined, { work: members });
  if (room.status === 'failed' || room.status === 'cancelled') {
    return resolve(
      'stopped',
      { cause: room.status === 'failed' ? 'The Room stopped before it finished' : 'The Room was cancelled', action: 'Open the Room to decide what next' },
      undefined,
      'Open the Room to decide what next',
    );
  }
  if (hitTimeLimit(room, nowMs)) {
    const cause = `reached its ${Math.round((room.maxWallClockMs ?? 0) / MINUTE_MS)} min time limit`;
    return resolve('stopped', { cause, action: 'Open the Room to decide what next' }, undefined, undefined, { work: cause, timeLimit: true });
  }
  const asked = askedOf(room);
  if (asked) {
    return resolve('waiting-for-you', { action: asked.action }, asked.at ? formatRelative(asked.at) : undefined, asked.action);
  }
  if (room.status === 'pausing') {
    // Turns already started finish; nothing new begins.
    const finishing = feedback?.activeCount || room.activeMemberCount;
    return resolve('paused', {}, undefined, undefined, { word: 'Pausing', work: finishing > 0 ? turnsFinishing(finishing) : null });
  }
  if (room.status === 'paused') return resolve('paused');
  if (isLive(room.liveRun, sessionStartedAt) || (feedback?.activeCount ?? 0) > 0) {
    return resolve('working', {}, undefined, undefined, { work: roomCurrentWork(feedback, nowMs) });
  }
  if (room.status === 'running' || room.status === 'starting' || room.status === 'completing') {
    return resolve('last-known', { lastReport: formatRelative(room.updatedAt) }, undefined, undefined, { work: members });
  }
  if (room.status === 'draft') return resolve('queued');
  return resolve('idle');
}
