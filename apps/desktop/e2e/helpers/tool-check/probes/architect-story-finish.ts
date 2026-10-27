/**
 * After delivery: the maintenance Workflow settles, the user reads the
 * project (trace, history, feedback), the OpenSpec change flow runs on the
 * project's folder, the preview and the picture are shown, the two recovery
 * actions answer for a healthy project, and the owner blocks, sleeps and is
 * stopped and deleted.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { owner, user, type StoryEntry } from './architect-gate';
import {
  captured, exists, must, ownerParams, projectIdOf, readProject, refused, requireProject, saved, succeeded, userParams, waitForProject,
} from './architect-support';
import { waitUntil } from '../files';
import type { StepContext } from '../types';

/** One transparent pixel: a real PNG the project's picture view can show. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');

const PREVIEW_PAGE = 'tc-preview-ok';

/** The file the preview server writes its port to, in a folder of its own that a wait can watch. */
function portFile(ctx: StepContext): string {
  return path.join(saved(ctx, 'previewDir'), `port-${projectIdOf(ctx)}`);
}

/** A dev server that serves one line and says where it listens, so the test can fetch it. */
function serverSource(port: string): string {
  return [
    "const http = require('http');",
    "const fs = require('fs');",
    `const server = http.createServer((request, response) => response.end(${JSON.stringify(PREVIEW_PAGE)}));`,
    `server.listen(0, '127.0.0.1', () => {`,
    '  const { port } = server.address();',
    `  fs.writeFileSync(${JSON.stringify(port)}, String(port));`,
    "  console.log('Local: http://127.0.0.1:' + port + '/');",
    '});',
  ].join('\n');
}

export const finishStory: StoryEntry[] = [
  user('main', {
    action: 'resume',
    // Entering maintenance creates the maintenance Workflow. If its start blocked the project, resume lifts that.
    setup: async (ctx) => {
      // A start that failed only logs, so the wait is bounded and the record decides.
      await waitForProject(ctx, 'the maintenance Workflow to settle', (current) =>
        !current.preparingMaintenance && (current.blockedReason !== null || current.milestones.some((item) => item.id === 'maintenance')) ? current : null, 90_000)
        .catch(() => undefined);
      ctx.state.blockedByMaintenance = (await requireProject(ctx)).blockedReason !== null;
    },
    params: (ctx) => userParams(ctx, 'resume'),
    expect: async (result, ctx) => {
      if (ctx.state.blockedByMaintenance === true) {
        succeeded(result, 'resumed');
        must((await requireProject(ctx)).blockedReason === null, 'the project is still blocked');
        return;
      }
      refused(result, 'not paused, blocked');
    },
  }),
  user('main', {
    action: 'show',
    params: (ctx) => userParams(ctx, 'show'),
    expect: (result) => succeeded(result, 'maintain'),
  }),
  user('main', {
    action: 'trace',
    params: (ctx) => userParams(ctx, 'trace'),
    expect: (result) => succeeded(result, 'Trace summary'),
  }),
  user('main', {
    action: 'trace',
    params: (ctx) => userParams(ctx, 'trace', { runId: 'lifetime' }),
    expect: (result) => succeeded(result, 'Project lifetime totals'),
  }),
  user('main', {
    action: 'history',
    params: (ctx) => userParams(ctx, 'history'),
    expect: (result) => {
      succeeded(result, 'owner-session history entries');
      must(Number(captured(result.text, /Read (\d+) owner-session/, 'entry count')) > 0, `the owner has taken turns, so its history cannot be empty: ${result.text}`);
    },
  }),
  user('main', {
    action: 'feedback',
    params: (ctx) => userParams(ctx, 'feedback'),
    expect: (result) => {
      succeeded(result, 'work item(s) reported');
      must(/^\d+ work item\(s\) reported\.$/.test(result.text.trim()), `unexpected feedback line: ${result.text}`);
    },
  }),
  user('main', {
    action: 'enable_openspec',
    params: (ctx) => userParams(ctx, 'enable_openspec'),
    expect: async (result, ctx) => {
      succeeded(result, 'OpenSpec enabled');
      const project = await requireProject(ctx);
      must(project.openSpecEnabled === true, 'the record does not say OpenSpec is enabled');
      must(await exists(path.join(project.folder, 'openspec')), 'OpenSpec left no openspec folder in the project');
    },
  }),
  user('main', {
    action: 'request_change',
    params: (ctx) => userParams(ctx, 'request_change', { text: 'tc-change: add a footer to the notes page.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'requested');
      const name = captured(result.text, /Change (\S+) requested/, 'change name');
      ctx.state.changeName = name;
      const project = await requireProject(ctx);
      must(project.milestones.some((item) => item.openSpecChange === name), 'no milestone is linked to the change');
      must(await exists(path.join(project.folder, 'openspec', 'changes', name)), 'OpenSpec made no folder for the change');
    },
  }),
  owner('main', {
    action: 'openspec',
    params: (ctx) => ownerParams(ctx, 'openspec', { operation: 'instructions', changeName: saved(ctx, 'changeName'), artifact: 'proposal' }),
    expect: (result) => {
      succeeded(result);
      must(result.text.trim().length > 40, `the instructions are empty: ${result.text}`);
    },
  }),
  owner('main', {
    action: 'openspec',
    // A change with no artifacts yet is not ready, and the tool says so.
    params: (ctx) => ownerParams(ctx, 'openspec', { operation: 'validate', changeName: saved(ctx, 'changeName') }),
    expect: (result) => {
      must(result.text.trim().length > 0, 'validate said nothing');
    },
  }),
  owner('main', {
    action: 'openspec',
    params: (ctx) => ownerParams(ctx, 'openspec', { operation: 'status', changeName: saved(ctx, 'changeName') }),
    expect: (result, ctx) => {
      succeeded(result);
      must(result.text.includes(saved(ctx, 'changeName')) || result.text.trim().length > 20, `OpenSpec status says nothing: ${result.text}`);
    },
  }),
  user('main', {
    action: 'preview_available',
    // A project with a dev script has a preview.
    setup: async (ctx) => {
      ctx.state.previewDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-preview-'));
      const project = await requireProject(ctx);
      await fs.writeFile(path.join(project.folder, 'package.json'), JSON.stringify({ name: 'tc-notes', private: true, scripts: { dev: 'node server.js' } }));
      await fs.writeFile(path.join(project.folder, 'server.js'), serverSource(portFile(ctx)));
    },
    params: (ctx) => userParams(ctx, 'preview_available'),
    expect: (result) => succeeded(result, 'has a preview'),
  }),
  user('main', {
    action: 'preview',
    params: (ctx) => userParams(ctx, 'preview'),
    expect: async (result, ctx) => {
      succeeded(result, 'Project preview is running');
      // The dev server the project started answers over HTTP.
      const port = await waitUntilPort(portFile(ctx));
      const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      must(page === PREVIEW_PAGE, `the preview served ${JSON.stringify(page)}`);
    },
  }),
  user('main', {
    action: 'picture',
    params: (ctx) => userParams(ctx, 'picture', { newerThan: '2999-01-01T00:00:00.000Z' }),
    setup: async (ctx) => {
      const project = await requireProject(ctx);
      const file = path.join(project.folder, '.sero', 'tmp', 'automation-browser-shot.png');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, PNG);
    },
    // A picture the view already holds is not sent again.
    expect: (result) => refused(result, 'No newer picture'),
  }),
  user('main', {
    action: 'picture',
    params: (ctx) => userParams(ctx, 'picture'),
    expect: (result) => succeeded(result, 'Picture read'),
  }),
  user('main', {
    action: 'repair',
    // Nothing is disconnected in a healthy project, and the action says so without changing it.
    params: (ctx) => userParams(ctx, 'repair'),
    expect: async (result, ctx) => {
      refused(result, 'No single disconnected workflow');
      must((await requireProject(ctx)).milestones.find((item) => item.id === 'm1')?.dispatch !== null, 'repair disturbed the Workflow link');
    },
  }),
  user('main', {
    action: 'retry',
    params: (ctx) => userParams(ctx, 'retry', { milestoneId: 'm1' }),
    expect: (result) => refused(result, 'no interrupted Workflow'),
  }),
  owner('main', {
    action: 'blocked',
    params: (ctx) => ownerParams(ctx, 'blocked', { text: 'tc-blocked: waiting for the user to look at the preview.' }),
    expect: async (result, ctx) => {
      succeeded(result, 'The project is blocked');
      must((await requireProject(ctx)).blockedReason?.includes('tc-blocked') === true, 'the block is not on the record');
    },
  }),
  user('main', {
    action: 'resume',
    params: (ctx) => userParams(ctx, 'resume'),
    expect: async (result, ctx) => {
      succeeded(result, 'resumed');
      must((await requireProject(ctx)).blockedReason === null, 'the project is still blocked');
    },
  }),
  owner('main', {
    action: 'sleep',
    params: (ctx) => ownerParams(ctx, 'sleep'),
    expect: (result) => succeeded(result, 'Sleeping'),
  }),
  user('main', {
    action: 'stop',
    params: (ctx) => userParams(ctx, 'stop'),
    expect: async (result, ctx) => {
      succeeded(result, 'stopped');
      must((await requireProject(ctx)).blockedReason === 'stopped by the user', 'the stop is not on the record');
    },
  }),
  user('main', {
    action: 'delete',
    params: (ctx) => userParams(ctx, 'delete'),
    expect: async (result, ctx) => {
      succeeded(result, 'deleted');
      must((await readProject(ctx)) === null, 'the project record is still on disk');
    },
  }),
];

/** The port the preview server wrote, once it has. */
async function waitUntilPort(file: string): Promise<string> {
  return waitUntil(path.dirname(file), 'the preview server to say where it listens', async () => {
    try {
      return (await fs.readFile(file, 'utf8')).trim() || null;
    } catch {
      return null;
    }
  }, 120_000);
}
