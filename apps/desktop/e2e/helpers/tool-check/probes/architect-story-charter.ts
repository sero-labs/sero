/**
 * The deprecated charter flow, first in the story so that the main project's
 * steps are the last to run each shared action. A project made without a start
 * cap proposes a charter in discovery and waits for the user to approve it.
 */
import { owner, user, type StoryEntry } from './architect-gate';
import { allowCards, captured, must, ownerParams, readProject, requireProject, succeeded, userParams, waitForProject } from './architect-support';

export const CHARTER_NAME = 'tc-architect-charter';

export const charterStory: StoryEntry[] = [
  user('charter', {
    action: 'create',
    params: { action: 'create', idea: 'tc-charter idea: a notes page, built the old way.', folder: `~/${CHARTER_NAME}` },
    expect: async (result, ctx) => {
      succeeded(result, 'created');
      ctx.state.projectId = captured(result.text, /Project (\S+) "/, 'project id');
      const project = await requireProject(ctx);
      must(project.name === CHARTER_NAME, `the project is named ${project.name}`);
      must(project.charter === null && project.agreement === undefined, 'a project made without a start cap should use the charter flow');
    },
  }),
  user('charter', {
    action: 'resume',
    setup: async (ctx) => { ctx.state.cardsBefore = allowCards.count; },
    params: (ctx) => userParams(ctx, 'resume'),
    expect: async (result, ctx) => {
      succeeded(result, 'resumed');
      await waitForProject(ctx, 'discovery to start', (project) => project.phase === 'discovery');
      must(allowCards.count > Number(ctx.state.cardsBefore), 'the host never showed the permission card');
    },
  }),
  owner('charter', {
    action: 'charter',
    params: (ctx) => ownerParams(ctx, 'charter', {
      milestonesJson: JSON.stringify([{ title: 'tc-charter milestone', plan: 'Write one page.' }]),
      escalationPolicy: 'Raise anything that spends money.',
      autonomy: 'milestones',
      capUsd: 10,
    }),
    expect: async (result, ctx) => {
      succeeded(result, 'Charter proposed');
      const project = await requireProject(ctx);
      must(project.phase === 'charter', `the project is in ${project.phase}, expected charter`);
      must(project.charter?.autonomy === 'milestones' && project.charter.approvedAt === null, 'the proposed charter is not on the record');
      must(project.milestones.length === 1, 'the charter milestone is not on the record');
    },
  }),
  owner('charter', {
    action: 'sleep',
    params: (ctx) => ownerParams(ctx, 'sleep'),
    expect: (result) => succeeded(result, 'Sleeping'),
  }),
  user('charter', {
    action: 'approve',
    params: (ctx) => userParams(ctx, 'approve', { target: 'charter' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Charter approved');
      const project = await requireProject(ctx);
      must(project.phase === 'build' && project.charter?.approvedAt, 'the approved charter did not start the build');
    },
  }),
  user('charter', {
    action: 'delete',
    params: (ctx) => userParams(ctx, 'delete'),
    expect: async (result, ctx) => {
      succeeded(result, 'deleted');
      must((await readProject(ctx)) === null, 'the project record is still on disk');
    },
  }),
];
