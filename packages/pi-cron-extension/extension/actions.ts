/**
 * Cron tool action handlers — extracted from index.ts to stay under 500 LOC.
 *
 * Each handler receives the current state, tool params, and dependencies,
 * then returns the result message string. State writes happen here.
 */

import type { CronState, CronJob, CronRunResult } from '../shared/types';
import { validateCron } from '../shared/cron';
import type { CronScheduler } from './scheduler';
import { runTransientSession } from './session-runner';
import { info, error as logError } from './logger';

export interface ActionDeps {
  state: CronState;
  statePath: string;
  scheduler: CronScheduler | null;
  workspaceCwd: string;
  writeState: (filePath: string, state: CronState) => Promise<void>;
  appendRunResult: (result: CronRunResult) => Promise<void>;
  /** Tool execution context cwd (may differ from workspaceCwd). */
  ctxCwd?: string;
}

interface ActionParams {
  action: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  channel?: string;
  model?: string;
  run_if_missed?: boolean;
}

// ── List ────────────────────────────────────────────────────────

export function handleList(deps: ActionDeps): string {
  const { state, scheduler } = deps;

  if (state.jobs.length === 0) {
    return 'No cron jobs configured.';
  }

  const running = scheduler?.getRunningNames() ?? [];
  const lines = state.jobs.map((j) => {
    const status = j.disabled
      ? '⏸ disabled'
      : running.includes(j.name)
        ? '🔄 running'
        : '✅ active';
    const ch = j.channel !== 'cron' ? ` [${j.channel}]` : '';
    const mdl = j.model ? ` (${j.model})` : '';
    const recover = j.runIfMissed ? ' 🔄recover' : '';
    return `- **${j.name}** \`${j.schedule}\` ${status}${ch}${mdl}${recover}\n  ${j.prompt.slice(0, 80)}`;
  });

  const note = scheduler?.isRunning()
    ? ''
    : '\n\n⚠️ Scheduler is inactive. Use `/cron on` to start.';

  return `**Cron Jobs (${state.jobs.length}):**\n\n${lines.join('\n\n')}${note}`;
}

// ── Add ─────────────────────────────────────────────────────────

export async function handleAdd(
  params: ActionParams,
  deps: ActionDeps,
): Promise<string> {
  const { state, statePath, scheduler, writeState } = deps;

  if (!params.name || !params.schedule || !params.prompt) {
    return 'Missing required fields: name, schedule, and prompt.';
  }
  const err = validateCron(params.schedule);
  if (err) return `Invalid cron expression: ${err}`;

  if (state.jobs.find((j) => j.name === params.name)) {
    return `Job "${params.name}" already exists.`;
  }

  const newJob: CronJob = {
    name: params.name,
    schedule: params.schedule,
    prompt: params.prompt,
    channel: params.channel ?? 'cron',
    disabled: false,
  };
  if (params.model) newJob.model = params.model;
  if (params.run_if_missed) newJob.runIfMissed = true;

  state.jobs.push(newJob);
  await writeState(statePath, state);
  scheduler?.updateJobs(state.jobs);

  return `✓ Added cron job "${params.name}" (${params.schedule})`;
}

// ── Update ──────────────────────────────────────────────────────

export async function handleUpdate(
  params: ActionParams,
  deps: ActionDeps,
): Promise<string> {
  const { state, statePath, scheduler, writeState } = deps;

  if (!params.name) return 'Missing required field: name';

  const job = state.jobs.find((j) => j.name === params.name);
  if (!job) return `Job "${params.name}" not found.`;

  if (params.schedule) {
    const err = validateCron(params.schedule);
    if (err) return `Invalid cron expression: ${err}`;
    job.schedule = params.schedule;
  }
  if (params.prompt) job.prompt = params.prompt;
  if (params.channel) job.channel = params.channel;
  if (params.model !== undefined) job.model = params.model || undefined;
  if (params.run_if_missed !== undefined) job.runIfMissed = params.run_if_missed;

  await writeState(statePath, state);
  scheduler?.updateJobs(state.jobs);

  return `✓ Updated "${params.name}"`;
}

// ── Remove ──────────────────────────────────────────────────────

export async function handleRemove(
  params: ActionParams,
  deps: ActionDeps,
): Promise<string> {
  const { state, statePath, scheduler, writeState } = deps;

  if (!params.name) return 'Missing required field: name';

  const idx = state.jobs.findIndex((j) => j.name === params.name);
  if (idx === -1) return `Job "${params.name}" not found.`;

  state.jobs.splice(idx, 1);
  await writeState(statePath, state);
  scheduler?.updateJobs(state.jobs);

  return `✓ Removed "${params.name}"`;
}

// ── Enable / Disable ────────────────────────────────────────────

export async function handleToggle(
  params: ActionParams,
  deps: ActionDeps,
  disable: boolean,
): Promise<string> {
  const { state, statePath, scheduler, writeState } = deps;

  if (!params.name) return 'Missing required field: name';

  const job = state.jobs.find((j) => j.name === params.name);
  if (!job) return `Job "${params.name}" not found.`;

  job.disabled = disable;
  await writeState(statePath, state);
  scheduler?.updateJobs(state.jobs);

  return `✓ ${disable ? 'Disabled' : 'Enabled'} "${params.name}"`;
}

// ── Run (ad-hoc) ────────────────────────────────────────────────

export function handleRun(
  params: ActionParams,
  deps: ActionDeps,
): string {
  const { state, appendRunResult } = deps;

  if (!params.name) return 'Missing required field: name';

  const runJob = state.jobs.find((j) => j.name === params.name);
  if (!runJob) return `Job "${params.name}" not found.`;

  const runCwd = deps.ctxCwd || deps.workspaceCwd;
  info('job:trigger-adhoc', {
    job: runJob.name,
    model: runJob.model ?? 'default',
    cwd: runCwd,
  });

  // Fire-and-forget: run in transient session + record result
  const startedAt = new Date();
  runTransientSession(runJob.name, runJob.prompt, {
    model: runJob.model,
    cwd: runCwd,
  })
    .then(async (result) => {
      const ok = result.exitCode === 0 || !!result.output;
      const runResult: CronRunResult = {
        jobName: runJob.name,
        startedAt: startedAt.toISOString(),
        durationMs: result.durationMs,
        ok,
        output: result.output.slice(0, 4000),
        error: ok ? undefined : (result.error ?? 'Unknown error').slice(0, 2000),
      };
      if (ok) {
        info('job:adhoc-complete', { job: runJob.name, durationMs: result.durationMs });
      } else {
        logError('job:adhoc-failed', {
          job: runJob.name,
          durationMs: result.durationMs,
          error: runResult.error?.slice(0, 500),
        });
      }
      await appendRunResult(runResult);
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logError('job:adhoc-crash', { job: runJob.name, error: msg });
      console.error(`[cron] adhoc run crashed: ${runJob.name}`, err);
    });

  return `✓ Triggered "${params.name}" — running in background`;
}
