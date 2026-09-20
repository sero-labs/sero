/**
 * Home's opening line: what is happening in this workspace, in the words of the
 * shared vocabulary.
 *
 * The active count comes from `isLoopActive`, the same rule the Workflows list
 * words its rows with, so Home can no longer say "0 active" above a row the list
 * calls Active.
 */

import type { GoalIndexEntry } from '../../shared/goal-types';
import type { RoomSummary } from '../../shared/room-types';
import type { ActivityState } from '@sero-ai/common';
import type { LoopSummary } from '../../shared/types';
import { formatCost } from './format';
import { isLoopActive, loopActivity } from './loop-activity';
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
}

/** The last path segment of the workspace path, which is what the user calls it. */
export function workspaceName(workspacePath: string): string {
  const parts = workspacePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'this workspace';
}

export function homeStatus({ loops, rooms, goals, workspaceName: name, sessionStartedAt }: HomeStatusInput): HomeStatus {
  const workingLoops = loops.filter((loop) => isLoopActive(loop, sessionStartedAt)).length;
  const runningRooms = rooms.filter((room) => room.status === 'running').length;
  const activeCount = workingLoops + runningRooms;
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

  const armed = loops.filter((loop) => loopActivity(loop, sessionStartedAt).state === 'waiting-for-trigger').length;
  const detail = [
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
