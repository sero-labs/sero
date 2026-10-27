/**
 * The first milestone, done by a dispatched Workflow: refused before the user
 * approves its plan, started after, checked by the runtime's own evidence run,
 * and accepted on that evidence.
 */
import path from 'node:path';
import { owner, user, type StoryEntry } from './architect-gate';
import {
  exists, milestoneOf, must, ownerParams, refused, requireProject, succeeded, userParams, waitForFile, waitForProject,
} from './architect-support';
import { WORKFLOW_FILE, WORKFLOW_MARK } from './architect-stub';

/** The check the runtime runs: the file the Workflow's step wrote is there. */
export const fileCheck = (file: string): string => `node -e "require('fs').accessSync('${file}')"`;

export const workStory: StoryEntry[] = [
  owner('main', {
    action: 'dispatch',
    params: (ctx) => ownerParams(ctx, 'dispatch', {
      milestoneId: 'm1', kind: 'workflow', prompt: `${WORKFLOW_MARK}: write ${WORKFLOW_FILE} with the title tc-title.`, destination: 'workspace-files', maxCostUsd: 5,
    }),
    expect: async (result, ctx) => {
      // The plan is not approved yet, so nothing starts.
      refused(result, 'approval');
      must(milestoneOf(await requireProject(ctx), 'm1').dispatch === null, 'a refused dispatch still linked a Workflow');
    },
  }),
  user('main', {
    action: 'approve',
    params: (ctx) => userParams(ctx, 'approve', { target: 'milestone', milestoneId: 'm1' }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m1 approved for dispatch');
      must(milestoneOf(await requireProject(ctx), 'm1').status === 'approved', 'the milestone is not approved on the record');
    },
  }),
  owner('main', {
    action: 'dispatch',
    params: (ctx) => ownerParams(ctx, 'dispatch', {
      milestoneId: 'm1', kind: 'workflow', prompt: `${WORKFLOW_MARK}: write ${WORKFLOW_FILE} with the title tc-title.`, destination: 'workspace-files', maxCostUsd: 5,
    }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m1 is starting as workflow');
      // The stub plans and runs the Workflow; its step writes the page and the runtime records the receipt.
      const milestone = await waitForProject(ctx, 'the Workflow to report completion', (project) => {
        const found = project.milestones.find((item) => item.id === 'm1');
        return found?.dispatch && found.status === 'verifying' && found.receipt ? found : null;
      }, 420_000);
      must(milestone.dispatch?.kind === 'workflow', 'the milestone is not linked to a Workflow');
      const folder = String(ctx.state.folder);
      must(await exists(path.join(folder, WORKFLOW_FILE)), `the Workflow never wrote ${WORKFLOW_FILE} in ${folder}`);
    },
    // The planner, the step and the watcher each take a turn of their own.
  }),
  owner('main', {
    action: 'evidence',
    params: (ctx) => ownerParams(ctx, 'evidence', { milestoneId: 'm1', commandsJson: [fileCheck(WORKFLOW_FILE)], criteria: 'c1' }),
    setup: async (ctx) => { await waitForFile(String(ctx.state.folder), path.join(String(ctx.state.folder), WORKFLOW_FILE), 'the page'); },
    expect: async (result, ctx) => {
      succeeded(result, 'Evidence run started for milestone m1');
      const milestone = await waitForProject(ctx, 'the evidence to pass', (project) => {
        const found = project.milestones.find((item) => item.id === 'm1');
        return found?.evidence?.passed ? found : null;
      }, 240_000);
      must(milestone.evidence?.binding?.criteria.some((criterion) => criterion.id === 'c1'), 'the evidence does not name criterion c1');
    },
  }),
  owner('main', {
    action: 'milestone',
    params: (ctx) => ownerParams(ctx, 'milestone', { milestoneId: 'm1', done: true }),
    expect: async (result, ctx) => {
      succeeded(result, 'Milestone m1 is done');
      must(milestoneOf(await requireProject(ctx), 'm1').status === 'done', 'the milestone is not done on the record');
    },
  }),
];
