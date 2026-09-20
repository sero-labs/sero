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
} from '@sero-ai/common';
import type { RoomSummary } from '../../shared/room-types';
import { formatRelative } from './format';

export interface RoomActivity {
  state: ActivityState;
  word: string;
  nextStep: string | null;
  /** How long it has waited on the user, e.g. "9 days". Only when it waits. */
  waitingFor?: string;
  /** What the user must do. Only when the Room asks for something. */
  action?: string;
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

export function roomActivity(room: RoomSummary, sessionStartedAt: string): RoomActivity {
  const resolve = (state: ActivityState, detail: ActivityDetail = {}, waitingFor?: string, action?: string): RoomActivity => {
    const nextStep = activityNextStep(state, detail);
    if (nextStep === null) {
      return {
        state: 'last-known',
        word: ACTIVITY_STATE_WORD['last-known'],
        nextStep: activityNextStep('last-known', { lastReport: formatRelative(room.updatedAt) }),
      };
    }
    return {
      state,
      word: ACTIVITY_STATE_WORD[state],
      nextStep,
      ...(waitingFor ? { waitingFor } : {}),
      ...(action ? { action } : {}),
    };
  };

  if (room.status === 'completed') return resolve('complete');
  if (room.status === 'failed' || room.status === 'cancelled') {
    return resolve(
      'stopped',
      { cause: room.status === 'failed' ? 'The Room stopped before it finished' : 'The Room was cancelled', action: 'Open the Room to decide what next' },
      undefined,
      'Open the Room to decide what next',
    );
  }
  const asked = askedOf(room);
  if (asked) {
    return resolve('waiting-for-you', { action: asked.action }, asked.at ? formatRelative(asked.at) : undefined, asked.action);
  }
  if (room.status === 'paused' || room.status === 'pausing') return resolve('paused');
  if (isLive(room.liveRun, sessionStartedAt)) return resolve('working');
  if (room.status === 'running' || room.status === 'starting' || room.status === 'completing') {
    return resolve('last-known', { lastReport: formatRelative(room.updatedAt) });
  }
  if (room.status === 'draft') return resolve('queued');
  return resolve('idle');
}
