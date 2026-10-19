import path from 'node:path';
import { STUB_MODEL_ID, STUB_PROVIDER_ID } from '../../stub-model';
import { expectOk, expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { cronState, expectContains, expectLacks, must, profileDir, waitFor } from './cron-memory-support';

export const currentTimeProbe: ToolProbe = {
  tool: 'current_time',
  steps: [{
    action: null,
    params: {},
    expect(result) {
      // plugins/sero-cron-plugin/extension/tools.ts: `Current time: ${iso}\nLocal: ...\nTimezone: UTC+h:mm\nUnix: ${ms}`
      expectText(result, 'Current time: ');
      const match = /^Current time: (\S+)\nLocal: .+\nTimezone: UTC[+-]?\d+:\d{2}\nUnix: (\d+)$/.exec(result.text.trim());
      must(match, `unexpected current_time text: ${result.text}`);
      const unix = Number(match[2]);
      must(Math.abs(unix - Date.now()) < 120_000, `the reported time is ${unix}, the clock reads ${Date.now()}`);
      must(Date.parse(match[1]!) === unix, `the ISO time ${match[1]} and the unix time ${unix} disagree`);
    },
  }],
};

const JOB = 'tc-cron-job';
const MARKER = 'tc-cron-run-marker-4f1c';
const REPLY = 'tc-cron-reply: the scheduled job ran';
const MODEL = `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`;
const FIRST_SCHEDULE = '0 3 1 1 *';
const SECOND_SCHEDULE = '30 4 2 2 *';

async function requireJob(ctx: StepContext) {
  const job = (await cronState(ctx)).jobs.find((entry) => entry.name === JOB);
  must(job, `${JOB} is not in the cron state file`);
  return job;
}

export const cronProbe: ToolProbe = {
  tool: 'cron',
  // `run` waits for the job's background session.
  timeoutMs: 240_000,
  steps: [
    {
      action: 'add',
      params: { action: 'add', name: JOB, schedule: FIRST_SCHEDULE, prompt: `${MARKER}: reply with one sentence`, channel: 'tc-cron', model: MODEL },
      async expect(result, ctx) {
        expectText(result, `✓ Added cron job "${JOB}" (${FIRST_SCHEDULE})`);
        const job = await requireJob(ctx);
        must(job.schedule === FIRST_SCHEDULE && job.channel === 'tc-cron' && job.model === MODEL, `job saved wrongly: ${JSON.stringify(job)}`);
        must(job.prompt.includes(MARKER) && job.disabled === false, `job saved wrongly: ${JSON.stringify(job)}`);
      },
    },
    {
      // A second add under the same name is refused and leaves one job.
      action: 'add',
      params: { action: 'add', name: JOB, schedule: SECOND_SCHEDULE, prompt: 'tc-cron duplicate' },
      async expect(result, ctx) {
        expectText(result, `Job "${JOB}" already exists.`);
        const jobs = (await cronState(ctx)).jobs.filter((entry) => entry.name === JOB);
        must(jobs.length === 1 && jobs[0]!.schedule === FIRST_SCHEDULE, `duplicate add changed the state: ${JSON.stringify(jobs)}`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result) => expectContains(result, `**${JOB}**`, `\`${FIRST_SCHEDULE}\``, '✅ active', ' [tc-cron]', `(${MODEL})`),
    },
    {
      action: 'update',
      params: { action: 'update', name: JOB, schedule: SECOND_SCHEDULE, run_if_missed: true },
      async expect(result, ctx) {
        expectText(result, `✓ Updated "${JOB}"`);
        const job = await requireJob(ctx);
        must(job.schedule === SECOND_SCHEDULE && job.runIfMissed === true, `job not updated: ${JSON.stringify(job)}`);
        must(job.prompt.includes(MARKER), `update dropped the prompt: ${JSON.stringify(job)}`);
      },
    },
    {
      action: 'disable',
      params: { action: 'disable', name: JOB },
      async expect(result, ctx) {
        expectText(result, `✓ Disabled "${JOB}"`);
        must((await requireJob(ctx)).disabled === true, `${JOB} is not disabled in the state file`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result) => expectContains(result, `**${JOB}**`, '⏸ disabled', `\`${SECOND_SCHEDULE}\``),
    },
    {
      action: 'enable',
      params: { action: 'enable', name: JOB },
      async expect(result, ctx) {
        expectText(result, `✓ Enabled "${JOB}"`);
        must((await requireJob(ctx)).disabled === false, `${JOB} is still disabled in the state file`);
      },
    },
    {
      // The job's agent session talks to the stub. The responder answers only
      // the session whose user message carries the job's marker.
      action: 'run',
      setup: async (ctx) => {
        if (!ctx.respondWith) throw new Error('this step needs respondWith');
        ctx.state.runFrom = Date.now();
        ctx.state.removeCronResponder = ctx.respondWith((request) =>
          request.messages.some((message) => message.role === 'user' && message.text.includes(MARKER)) ? { text: REPLY } : undefined);
      },
      params: { action: 'run', name: JOB },
      timeoutMs: 60_000,
      async expect(result, ctx) {
        try {
          expectText(result, `✓ Triggered "${JOB}" — running in background`);
          const from = Number(ctx.state.runFrom);
          const run = await waitFor(path.join(await profileDir(ctx), 'apps', 'cron'), 'the job run to be recorded in the cron state file', async () =>
            (await cronState(ctx)).lastRunResults.find((entry) => entry.jobName === JOB && Date.parse(entry.startedAt) >= from - 2_000), 90_000);
          must(run.ok, `the job run failed: ${run.error}`);
          must(run.output === REPLY, `the job run recorded ${JSON.stringify(run.output)}, expected the stub's reply`);
        } finally {
          const remove = ctx.state.removeCronResponder;
          if (typeof remove === 'function') remove();
        }
      },
    },
    {
      action: 'remove',
      params: { action: 'remove', name: 'tc-cron-missing' },
      async expect(result, ctx) {
        expectText(result, 'Job "tc-cron-missing" not found.');
        await requireJob(ctx);
      },
    },
    {
      action: 'remove',
      params: { action: 'remove', name: JOB },
      async expect(result, ctx) {
        expectText(result, `✓ Removed "${JOB}"`);
        must(!(await cronState(ctx)).jobs.some((entry) => entry.name === JOB), `${JOB} is still in the cron state file`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result) => { expectOk(result); expectLacks(result, JOB); },
    },
  ],
};
