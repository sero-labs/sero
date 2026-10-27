/**
 * The main project, from nothing to a started build: the user's own settings
 * before the start approval, then the owner's first calls (brief, approach,
 * overview, status, research) and its first plan (milestones, a decision).
 */
import { STUB_MODEL_ID, STUB_PROVIDER_ID } from '../../stub-model';
import { owner, user, type StoryEntry } from './architect-gate';
import {
  allowCards, captured, must, ownerParams, projectIdOf, requireProject, saved, succeeded, userParams, waitForProject,
} from './architect-support';
import { RESEARCH_FINDING, RESEARCH_QUESTION } from './architect-stub';

export const MAIN_NAME = 'tc-architect-main';
const STUB_MODEL = `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`;

export const setupStory: StoryEntry[] = [
  user('main', {
    action: 'list',
    params: { action: 'list' },
    expect: (result) => succeeded(result, 'No Architect projects yet'),
  }),
  user('main', {
    action: 'create',
    params: { action: 'create', idea: 'tc-main idea: a one page notes site with a title.', folder: `~/${MAIN_NAME}`, capUsd: 20, executionMode: 'workspace' },
    expect: async (result, ctx) => {
      succeeded(result, 'created');
      ctx.state.projectId = captured(result.text, /Project (\S+) "/, 'project id');
      const project = await requireProject(ctx);
      must(project.name === MAIN_NAME, `the project is named ${project.name}`);
      must(project.agreement && project.agreement.approvedAt === null, 'a project made with a start cap should wait for the start approval');
      ctx.state.folder = project.folder;
    },
  }),
  user('main', {
    action: 'list',
    params: { action: 'list' },
    expect: (result, ctx) => succeeded(result, MAIN_NAME, projectIdOf(ctx)),
  }),
  user('main', {
    action: 'show',
    params: (ctx) => userParams(ctx, 'show'),
    expect: (result, ctx) => succeeded(result, `(${projectIdOf(ctx)})`, 'waiting for the start approval'),
  }),
  user('main', {
    action: 'set_execution_mode',
    params: (ctx) => userParams(ctx, 'set_execution_mode', { executionMode: 'worktree' }),
    expect: async (result, ctx) => {
      succeeded(result, 'worktree');
      must((await requireProject(ctx)).executionMode === 'worktree', 'the record does not hold the worktree mode');
    },
  }),
  user('main', {
    action: 'set_execution_mode',
    params: (ctx) => userParams(ctx, 'set_execution_mode', { executionMode: 'workspace' }),
    expect: async (result, ctx) => {
      succeeded(result, 'workspace');
      must((await requireProject(ctx)).executionMode === 'workspace', 'the record does not hold the workspace mode');
    },
  }),
  user('main', {
    action: 'set_model_tier',
    params: (ctx) => userParams(ctx, 'set_model_tier', { tier: 'LOW', model: STUB_MODEL }),
    expect: async (result, ctx) => {
      succeeded(result);
      await waitForProject(ctx, 'the LOW override to be saved', (project) => project.modelOverrides?.LOW?.modelId === STUB_MODEL_ID);
    },
  }),
  user('main', {
    action: 'clear_model_tier',
    params: (ctx) => userParams(ctx, 'clear_model_tier', { tier: 'LOW' }),
    expect: async (result, ctx) => {
      succeeded(result);
      await waitForProject(ctx, 'the LOW override to be cleared', (project) => project.modelOverrides?.LOW === undefined);
    },
  }),
  user('main', {
    action: 'refresh_model_tiers',
    params: (ctx) => userParams(ctx, 'refresh_model_tiers'),
    expect: async (result, ctx) => {
      succeeded(result, 'Model tiers refreshed');
      must((await requireProject(ctx)).modelTiers?.LOW?.modelId === STUB_MODEL_ID, 'the record did not take the host model tiers');
    },
  }),
  user('main', {
    action: 'set_autonomy',
    params: (ctx) => userParams(ctx, 'set_autonomy', { autonomy: 'milestones' }),
    expect: async (result, ctx) => {
      succeeded(result, 'milestones');
      must((await requireProject(ctx)).autonomy === 'milestones', 'the record does not hold the autonomy');
    },
  }),
  user('main', {
    action: 'raise_cap',
    params: (ctx) => userParams(ctx, 'raise_cap', { capUsd: 25 }),
    expect: async (result, ctx) => {
      succeeded(result, '$25');
      must((await requireProject(ctx)).budget.capUsd === 25, 'the record does not hold the raised cap');
    },
  }),
  user('main', {
    action: 'watch_owner',
    params: (ctx) => userParams(ctx, 'watch_owner', { observerId: 'tc-view' }),
    expect: (result) => succeeded(result, 'Watching Architect'),
  }),
  user('main', {
    action: 'unwatch_owner',
    params: (ctx) => userParams(ctx, 'unwatch_owner', { observerId: 'tc-view' }),
    expect: (result) => succeeded(result, 'Stopped watching Architect'),
  }),
  user('main', {
    action: 'resume',
    setup: async (ctx) => { ctx.state.cardsBefore = allowCards.count; },
    params: (ctx) => userParams(ctx, 'resume'),
    expect: async (result, ctx) => {
      succeeded(result, 'resumed');
      await waitForProject(ctx, 'the build to start', (project) => project.phase === 'build' && Boolean(project.agreement?.approvedAt));
      must(allowCards.count > Number(ctx.state.cardsBefore), 'the host never showed the start approval card');
    },
  }),

  owner('main', {
    action: 'brief',
    params: (ctx) => ownerParams(ctx, 'brief', { text: 'tc-brief: a one page notes site with a title.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Brief recorded');
      must((await requireProject(ctx)).brief === 'tc-brief: a one page notes site with a title.', 'the brief is not on the record');
    },
  }),
  owner('main', {
    action: 'working',
    params: (ctx) => ownerParams(ctx, 'working', {
      objective: 'Make a one page notes site with a title.',
      approach: 'Write one HTML file and check that it exists.',
      criteriaJson: JSON.stringify([{ id: 'c1', text: 'The page shows a title.', userStated: true }]),
      assumptionsJson: JSON.stringify([{ text: 'One file is enough.', why: 'The page is small.' }]),
    }),
    expect: async (result, ctx) => {
      succeeded(result, 'Working interpretation saved at revision 1');
      const working = (await requireProject(ctx)).working;
      must(working?.criteria.some((criterion) => criterion.id === 'c1' && criterion.userStated), 'the stated criterion is not on the record');
    },
  }),
  owner('main', {
    action: 'summary',
    params: (ctx) => ownerParams(ctx, 'summary', { field: 'outcome', text: 'A one page notes site with a title.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'outcome summary is saved');
      must((await requireProject(ctx)).overview?.outcome?.text === 'A one page notes site with a title.', 'the overview does not hold the sentence');
    },
  }),
  owner('main', {
    action: 'status',
    params: (ctx) => ownerParams(ctx, 'status', { text: 'tc-status: planning the notes site' }),
    expect: async (result, ctx) => {
      succeeded(result, 'State line updated');
      must((await requireProject(ctx)).stateLine === 'tc-status: planning the notes site', 'the state line is not on the record');
    },
  }),
  owner('main', {
    action: 'research',
    params: (ctx) => ownerParams(ctx, 'research', { question: RESEARCH_QUESTION, stoppingCondition: 'One answer is enough.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'started');
      ctx.state.researchId = captured(result.text, /Research (\S+) started/, 'research id');
      // The researcher is a subagent session the stub answers; its finding is attached to the record.
      const found = await waitForProject(ctx, 'the research finding', (project) => project.research.find((entry) => entry.result.includes(RESEARCH_FINDING)));
      must(found.id === ctx.state.researchId, 'the finding belongs to another research');
    },
  }),
  owner('main', {
    action: 'summary',
    params: (ctx) => ownerParams(ctx, 'summary', { field: 'result', text: 'The layout question is answered.', sourceKind: 'research', sourceId: saved(ctx, 'researchId') }),
    expect: async (result, ctx) => {
      succeeded(result, 'result summary is saved');
      must((await requireProject(ctx)).overview?.result?.text === 'The layout question is answered.', 'the overview does not hold the result');
    },
  }),
  ...['tc-m1 notes page', 'tc-m2 held room', 'tc-m3 own work'].map((title, index) => owner('main', {
    action: 'milestone',
    params: (ctx) => ownerParams(ctx, 'milestone', { title }),
    expect: async (result, ctx) => {
      succeeded(result, `Milestone m${index + 1}`, 'added as planned');
      must((await requireProject(ctx)).milestones.some((milestone) => milestone.id === `m${index + 1}` && milestone.title === title), 'the milestone is not on the record');
    },
  })),
  owner('main', {
    action: 'milestone',
    params: (ctx) => ownerParams(ctx, 'milestone', { milestoneId: 'm1', plan: 'Write notes.html with the title tc-title.' }),
    expect: async (result, ctx) => {
      // Under the "milestones" autonomy a written plan waits for the user.
      succeeded(result, 'Milestone m1 updated', 'approval');
      must((await requireProject(ctx)).milestones.find((milestone) => milestone.id === 'm1')?.plan === 'Write notes.html with the title tc-title.', 'the plan is not on the record');
    },
  }),
  owner('main', {
    action: 'decide',
    params: (ctx) => ownerParams(ctx, 'decide', {
      question: 'tc-decision: one stylesheet or inline styles?',
      optionsJson: JSON.stringify([
        { id: 'a', label: 'Inline styles', consequence: 'One file holds everything.' },
        { id: 'b', label: 'A stylesheet', consequence: 'Two files, one for the styles.' },
      ]),
      recommendation: 'a',
      reason: 'The user owns the layout.',
    }),
    expect: async (result, ctx) => {
      succeeded(result, 'raised');
      const project = await requireProject(ctx);
      must(project.decisions.length === 1 && project.decisions[0]!.answer === null, 'the open decision is not on the record');
    },
  }),
  user('main', {
    action: 'answer',
    setup: async (ctx) => { ctx.state.decisionId = (await requireProject(ctx)).decisions[0]?.id; },
    params: (ctx) => userParams(ctx, 'answer', { decisionId: saved(ctx, 'decisionId'), optionId: 'a', note: 'tc note' }),
    expect: async (result, ctx) => {
      succeeded(result, 'answered with "a"');
      must((await requireProject(ctx)).decisions[0]?.answer?.optionId === 'a', 'the answer is not on the record');
    },
  }),
];
