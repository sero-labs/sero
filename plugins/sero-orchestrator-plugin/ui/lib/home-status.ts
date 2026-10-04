/**
 * Home's opening line: what is happening in this workspace, in the words of the
 * shared vocabulary.
 *
 * The active count comes from `loopActivity` and `roomActivity`, the same rules
 * the lists word their rows with, fed the same work feedback, so Home can no
 * longer say "0 active" above a row the list calls Working.
 */

import type { GoalIndexEntry } from '../../shared/goal-types';
import type { RoomSummary } from '../../shared/room-types';
import type { ActivityState, FeedbackSummary } from '@sero-ai/common';
import type { LoopSummary } from '../../shared/types';
import { formatCost } from './format';
import { loopActivity } from './loop-activity';
import { roomActivity } from './room-activity';
import { WORKFLOW_LABEL, WORKFLOWS_LABEL } from '../../shared/labels';

export interface HomeStatus {
  /** What is running, named. */
  headline: string;
  /** What waits, and what the workspace has spent. */
  detail: string;
  /** Workflows and Rooms with work happening now. */
  activeCount: number;
  /** The glyph the line leads with, from the shared vocabulary. */
  state: ActivityState;
}

export interface HomeStatusInput {
  loops: LoopSummary[];
  rooms: RoomSummary[];
  goals: GoalIndexEntry[];
  workspaceName: string;
  sessionStartedAt: string;
  /** What each Workflow's and Room's work reports now, by Workflow or Room id. */
  feedback?: ReadonlyMap<string, FeedbackSummary>;
  /** Times the open call, so a caller that ticks passes its own clock. */
  nowMs?: number;
}

/** The most current-work phrases the line names before it counts the rest. */
const NAMED_WORK = 2;

/** The last path segment of the workspace path, which is what the user calls it. */
export function workspaceName(workspacePath: string): string {
  const parts = workspacePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'this workspace';
}

export function homeStatus({
  loops, rooms, goals, workspaceName: name, sessionStartedAt, feedback = new Map(), nowMs = Date.now(),
}: HomeStatusInput): HomeStatus {
  // The same rule the lists use: a Workflow or Room is active when its row reads Working.
  const loopActivities = loops.map((loop) => ({ title: loop.title, activity: loopActivity(loop, sessionStartedAt, feedback.get(loop.id), nowMs) }));
  const roomActivities = rooms.map((room) => ({ title: room.title, activity: roomActivity(room, sessionStartedAt, feedback.get(room.id), nowMs) }));
  const workingLoops = loopActivities.filter(({ activity }) => activity.state === 'working').length;
  const runningRooms = roomActivities.filter(({ activity }) => activity.state === 'working').length;
  const activeCount = workingLoops + runningRooms;
  // What the active work does now, named briefly. A row without a known wait adds nothing.
  const current = [...roomActivities, ...loopActivities]
    .filter(({ activity }) => activity.state === 'working' && activity.work)
    .map(({ title, activity }) => `${title}: ${activity.work}`);
  const spent =
    rooms.reduce((total, room) => total + room.costUsd, 0)
    + loops.reduce((total, loop) => total + (loop.usage?.costUsd ?? 0), 0)
    + goals.reduce((total, goal) => total + (goal.costUsd ?? 0), 0);

  const running: string[] = [];
  if (workingLoops > 0) {
    running.push(`${workingLoops} ${workingLoops === 1 ? WORKFLOW_LABEL : WORKFLOWS_LABEL}`);
  }
  if (runningRooms > 0) running.push(`${runningRooms} ${runningRooms === 1 ? 'Room' : 'Rooms'}`);
  const headline = running.length > 0
    ? `${running.join(' and ')} working in ${name}`
    : `Nothing is running in ${name}`;

  const armed = loopActivities.filter(({ activity }) => activity.state === 'waiting-for-trigger').length;
  const detail = [
    ...current.slice(0, NAMED_WORK),
    current.length > NAMED_WORK ? `${current.length - NAMED_WORK} more` : null,
    armed > 0 ? `${armed} ${armed === 1 ? WORKFLOW_LABEL : WORKFLOWS_LABEL} waiting for a trigger` : null,
    `${formatCost(spent)} spent here`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  // Idle only when nothing runs and nothing is armed: an armed Workflow is
  // waiting for a trigger, which is not the same as having nothing to do.
  const state: ActivityState = activeCount > 0 ? 'working' : armed > 0 ? 'waiting-for-trigger' : 'idle';

  return { headline, detail, activeCount, state };
}
