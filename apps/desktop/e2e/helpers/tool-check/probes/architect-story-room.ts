/**
 * The second milestone, dispatched as a Room that stands by. The Room is held
 * open so the project's controls can act on it: the owner and the user each
 * pause and resume it, the project's own pause holds it, a watch follows it,
 * and the user's cancel sets the milestone aside.
 */
import { owner, user, type StoryEntry } from './architect-gate';
import {
  captured, milestoneOf, must, ownerParams, requireProject, saved, succeeded, userParams, waitForProject, waitForRoomStatus,
} from './architect-support';
import { ROOM_MARK } from './architect-stub';
import type { StepContext } from '../types';

async function roomIs(ctx: StepContext, status: string): Promise<void> {
  const project = await requireProject(ctx);
  await waitForRoomStatus(ctx, project, saved(ctx, 'roomId'), status);
}

export const roomStory: StoryEntry[] = [
  owner('main', {
    action: 'milestone',
    params: (ctx) => ownerParams(ctx, 'milestone', { milestoneId: 'm2', plan: 'Hold a Room open so the controls can act on it.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m2 updated');
      must(milestoneOf(await requireProject(ctx), 'm2').plan !== null, 'the plan is not on the record');
    },
  }),
  user('main', {
    action: 'approve',
    params: (ctx) => userParams(ctx, 'approve', { target: 'milestone', milestoneId: 'm2' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m2 approved for dispatch');
      must(milestoneOf(await requireProject(ctx), 'm2').status === 'approved', 'the milestone is not approved on the record');
    },
  }),
  owner('main', {
    action: 'dispatch',
    params: (ctx) => ownerParams(ctx, 'dispatch', { milestoneId: 'm2', kind: 'room', prompt: `${ROOM_MARK}: stand by.`, destination: 'workspace-files', maxCostUsd: 5 }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m2 is starting as room');
      // The Room planner is the stub; the Room is linked to the milestone once planned.
      const milestone = await waitForProject(ctx, 'the Room to be linked', (project) => {
        const found = project.milestones.find((item) => item.id === 'm2');
        return found?.dispatch?.kind === 'room' && found.status === 'running' ? found : null;
      }, 300_000);
      ctx.state.roomId = milestone.dispatch!.id;
      await roomIs(ctx, 'running');
    },
  }),
  user('main', {
    action: 'watch_room',
    params: (ctx) => userParams(ctx, 'watch_room', { roomId: saved(ctx, 'roomId'), observerId: 'tc-view' }),
    expect: (result) => succeeded(result, 'Watching 1 member(s)'),
  }),
  user('main', {
    action: 'unwatch_room',
    params: (ctx) => userParams(ctx, 'unwatch_room', { roomId: saved(ctx, 'roomId'), observerId: 'tc-view' }),
    expect: (result) => succeeded(result, 'Stopped watching the Room'),
  }),
  owner('main', {
    action: 'work',
    params: (ctx) => ownerParams(ctx, 'work', { operation: 'wait', source: 'child', target: 'm2' }),
    expect: async (result, ctx) => {
      succeeded(result, 'You wait for');
      const project = await requireProject(ctx);
      must(project.waits?.some((wait) => wait.outcome === null), 'the wait is not on the record');
    },
  }),
  owner('main', {
    action: 'control',
    params: (ctx) => ownerParams(ctx, 'control', { target: 'm2', operation: 'pause' }),
    expect: async (result, ctx) => {
      succeeded(result, 'No new turn starts');
      await roomIs(ctx, 'paused');
    },
  }),
  owner('main', {
    action: 'control',
    params: (ctx) => ownerParams(ctx, 'control', { target: 'm2', operation: 'resume' }),
    expect: async (result, ctx) => {
      succeeded(result, 'It is the same Room');
      await roomIs(ctx, 'running');
    },
  }),
  user('main', {
    action: 'control',
    params: (ctx) => userParams(ctx, 'control', { workId: 'm2', operation: 'pause' }),
    expect: async (result, ctx) => {
      succeeded(result, 'No new turn starts');
      await roomIs(ctx, 'paused');
    },
  }),
  user('main', {
    action: 'control',
    params: (ctx) => userParams(ctx, 'control', { workId: 'm2', operation: 'resume' }),
    expect: async (result, ctx) => {
      succeeded(result, 'It is the same Room');
      await roomIs(ctx, 'running');
    },
  }),
  user('main', {
    action: 'pause',
    params: (ctx) => userParams(ctx, 'pause'),
    expect: async (result, ctx) => {
      succeeded(result, 'paused');
      must((await requireProject(ctx)).paused, 'the record is not paused');
      // Under an agreement the pause holds the Rooms the project started.
      await roomIs(ctx, 'paused');
    },
  }),
  user('main', {
    action: 'resume',
    params: (ctx) => userParams(ctx, 'resume'),
    expect: async (result, ctx) => {
      succeeded(result, 'resumed');
      must(!(await requireProject(ctx)).paused, 'the record is still paused');
      await roomIs(ctx, 'running');
    },
  }),
  user('main', {
    action: 'control',
    params: (ctx) => userParams(ctx, 'control', { workId: 'm2', operation: 'cancel' }),
    expect: async (result, ctx) => {
      succeeded(result, 'cancelled', 'set aside');
      ctx.state.cancelledRoom = captured(result.text, /Room (\S+) is cancelled/, 'cancelled Room id');
      await waitForProject(ctx, 'the milestone to be set aside', (project) => project.milestones.find((item) => item.id === 'm2')?.status === 'parked');
    },
  }),
];
