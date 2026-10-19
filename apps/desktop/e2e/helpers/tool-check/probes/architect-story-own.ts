/**
 * The third milestone, done by the owner itself, and the delivery that moves
 * the project to maintenance: the user's directive and the owner's reply, the
 * owner's own work (begin, continue, report), evidence, acceptance, and the
 * summaries that point at the finished work.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { owner, user, type StoryEntry } from './architect-gate';
import {
  captured, milestoneOf, must, ownerParams, requireProject, saved, succeeded, userParams, waitForProject,
} from './architect-support';
import { OWN_WORK_FILE } from './architect-stub';
import { fileCheck } from './architect-story-work';

export const ownStory: StoryEntry[] = [
  owner('main', {
    action: 'milestone',
    params: (ctx) => ownerParams(ctx, 'milestone', { milestoneId: 'm3', plan: `Write ${OWN_WORK_FILE} myself.` }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m3 updated');
      must(milestoneOf(await requireProject(ctx), 'm3').plan !== null, 'the plan is not on the record');
    },
  }),
  user('main', {
    action: 'set_autonomy',
    params: (ctx) => userParams(ctx, 'set_autonomy', { autonomy: 'charter-only' }),
    expect: async (result, ctx) => {
      succeeded(result, 'charter-only');
      must((await requireProject(ctx)).autonomy === 'charter-only', 'the record does not hold the autonomy');
    },
  }),
  user('main', {
    action: 'directive',
    params: (ctx) => userParams(ctx, 'directive', { text: 'tc-directive: keep the page to one title.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'sent');
      ctx.state.directiveId = captured(result.text, /Directive (\S+) sent/, 'directive id');
      must((await requireProject(ctx)).directives.some((directive) => directive.id === ctx.state.directiveId && directive.reply === null), 'the directive is not on the record');
    },
  }),
  owner('main', {
    action: 'reply',
    params: (ctx) => ownerParams(ctx, 'reply', { directiveId: saved(ctx, 'directiveId'), text: 'tc-reply: one title it is.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Reply recorded');
      must((await requireProject(ctx)).directives.find((directive) => directive.id === ctx.state.directiveId)?.reply?.text === 'tc-reply: one title it is.', 'the reply is not on the record');
    },
  }),
  owner('main', {
    action: 'summary',
    params: (ctx) => ownerParams(ctx, 'summary', { field: 'acknowledgement', text: 'One title, as you asked.', sourceKind: 'directive', sourceId: saved(ctx, 'directiveId') }),
    expect: async (result, ctx) => {
      succeeded(result, 'acknowledgement summary is saved');
      must((await requireProject(ctx)).overview?.acknowledgement?.text === 'One title, as you asked.', 'the overview does not hold the acknowledgement');
    },
  }),
  owner('main', {
    action: 'work',
    params: (ctx) => ownerParams(ctx, 'work', { operation: 'begin', milestoneId: 'm3' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Work is recorded as started for milestone m3');
      ctx.state.executionId = captured(result.text, /execution (\S+),/, 'execution id');
      must(milestoneOf(await requireProject(ctx), 'm3').direct?.id === ctx.state.executionId, 'the execution is not on the milestone');
    },
  }),
  owner('main', {
    action: 'work',
    params: (ctx) => ownerParams(ctx, 'work', { operation: 'continue', milestoneId: 'm3', executionId: saved(ctx, 'executionId') }),
    expect: (result) => succeeded(result, 'You are woken again to continue milestone m3'),
  }),
  owner('main', {
    action: 'work',
    // The owner's own tools write the page; here the test process stands in for them.
    setup: async (ctx) => { await fs.writeFile(path.join(String(ctx.state.folder), OWN_WORK_FILE), '<h1>tc-own-title</h1>\n'); },
    params: (ctx) => ownerParams(ctx, 'work', {
      operation: 'report', milestoneId: 'm3', executionId: saved(ctx, 'executionId'), text: `Wrote ${OWN_WORK_FILE}.`, destination: 'workspace-files',
    }),
    expect: async (result, ctx) => {
      succeeded(result, 'recorded as a claim');
      const milestone = milestoneOf(await requireProject(ctx), 'm3');
      must(milestone.status === 'verifying' && Boolean(milestone.receipt), `m3 is ${milestone.status} with receipt ${milestone.receipt}`);
    },
  }),
  owner('main', {
    action: 'evidence',
    params: (ctx) => ownerParams(ctx, 'evidence', { milestoneId: 'm3', commandsJson: [fileCheck(OWN_WORK_FILE)], criteria: 'c1' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Evidence run started for milestone m3');
      await waitForProject(ctx, 'the evidence for m3 to pass', (project) => project.milestones.find((item) => item.id === 'm3')?.evidence?.passed, 240_000);
    },
  }),
  owner('main', {
    action: 'milestone',
    params: (ctx) => ownerParams(ctx, 'milestone', { milestoneId: 'm3', done: true }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m3 is done');
      // Every milestone is now done or set aside, and m3 has its receipt: the result is delivered.
      const project = await waitForProject(ctx, 'the project to reach maintenance', (current) => current.phase === 'maintain' ? current : null, 120_000);
      must(milestoneOf(project, 'm3').verification === 'delivered', 'm3 is not delivered');
    },
  }),
  owner('main', {
    action: 'working',
    params: (ctx) => ownerParams(ctx, 'working', { objective: 'Keep the one page notes site with a title.', reason: 'tc: the site is delivered and maintained now' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Working interpretation saved');
      must((await requireProject(ctx)).working?.objective === 'Keep the one page notes site with a title.', 'the revised objective is not on the record');
    },
  }),
  owner('main', {
    action: 'summary',
    params: (ctx) => ownerParams(ctx, 'summary', { field: 'result', text: 'The notes site is delivered.', sourceKind: 'milestone', sourceId: 'm3' }),
    expect: async (result, ctx) => {
      succeeded(result, 'result summary is saved');
      must((await requireProject(ctx)).overview?.result?.text === 'The notes site is delivered.', 'the overview does not hold the result');
    },
  }),
];
