/**
 * Cron Extension — Pi extension for managing scheduled cron jobs.
 *
 * Global-scoped: state at ~/.sero-ui/apps/cron/state.json (Sero)
 * or .sero/apps/cron/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools (LLM-callable): cron (list, add, update, remove, enable, disable, run)
 * Commands (user): /cron
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { CronState, CronJob, CronRunResult } from '../shared/types';
import { DEFAULT_CRON_STATE, MAX_RUN_RESULTS } from '../shared/types';
import { validateCron } from '../shared/cron';
import { CronScheduler, runPiSubprocess } from './scheduler';
import { initLogger, setLogPath, info, warn, error as logError } from './logger';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'cron', 'state.json');

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'cron', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic writes) ───────────────────────────────────

async function readState(filePath: string): Promise<CronState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as CronState;
  } catch {
    return { ...DEFAULT_CRON_STATE, jobs: [], lastRunResults: [] };
  }
}

async function writeState(
  filePath: string,
  state: CronState,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ────────────────────────────────────────────

const CronParams = Type.Object({
  action: StringEnum([
    'list', 'add', 'update', 'remove',
    'enable', 'disable', 'run',
  ] as const),
  name: Type.Optional(
    Type.String({ description: 'Job name (required for all except list)' }),
  ),
  schedule: Type.Optional(
    Type.String({
      description:
        'Cron expression: "min hour dom month dow". Example: "0 9 * * 1-5" = weekdays at 9am',
    }),
  ),
  prompt: Type.Optional(
    Type.String({
      description: 'Prompt to send to the agent when the job fires',
    }),
  ),
  channel: Type.Optional(
    Type.String({ description: 'Channel tag for grouping (default: "cron")' }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        'Model pattern or ID for this job (e.g. "sonnet", "openai/gpt-4o"). ' +
        'Supports "provider/id" and optional ":<thinking>" suffix. ' +
        'Omit to use the default model.',
    }),
  ),
});

// ── Extension ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';
  let scheduler: CronScheduler | null = null;

  // ── Scheduler callbacks ────────────────────────────────────

  async function appendRunResult(result: CronRunResult): Promise<void> {
    if (!statePath) return;
    const state = await readState(statePath);
    state.lastRunResults.unshift(result);
    if (state.lastRunResults.length > MAX_RUN_RESULTS) {
      state.lastRunResults = state.lastRunResults.slice(0, MAX_RUN_RESULTS);
    }
    await writeState(statePath, state);
  }

  function createScheduler(): CronScheduler {
    return new CronScheduler({
      onJobComplete: (result) => {
        appendRunResult(result).catch(() => {});
      },
    });
  }

  async function startScheduler(): Promise<string> {
    if (scheduler?.isRunning()) {
      warn('scheduler:start-skipped', { reason: 'already running' });
      return 'Scheduler is already running.';
    }
    if (!statePath) {
      logError('scheduler:start-failed', { reason: 'no state path' });
      return 'Error: no state path resolved.';
    }

    const state = await readState(statePath);
    scheduler = createScheduler();
    scheduler.start(state.jobs);

    state.schedulerActive = true;
    await writeState(statePath, state);

    return `✓ Cron scheduler started (${state.jobs.length} jobs loaded)`;
  }

  async function stopScheduler(): Promise<string> {
    if (!scheduler?.isRunning()) {
      warn('scheduler:stop-skipped', { reason: 'not running' });
      return 'Scheduler is not running.';
    }
    scheduler.stop();
    scheduler = null;

    if (statePath) {
      const state = await readState(statePath);
      state.schedulerActive = false;
      await writeState(statePath, state);
    }

    return '✓ Cron scheduler stopped';
  }

  // ── Lifecycle ──────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
    initLogger(pi, statePath);
    info('session:start', { cwd: ctx.cwd, statePath });

    const state = await readState(statePath);

    if (state.autostart && state.jobs.length > 0) {
      info('scheduler:autostart', { jobs: state.jobs.length });
      scheduler = createScheduler();
      scheduler.start(state.jobs);
      state.schedulerActive = true;
      await writeState(statePath, state);
    } else if (state.schedulerActive) {
      info('scheduler:reset-stale-flag');
      state.schedulerActive = false;
      await writeState(statePath, state);
    }
  });

  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
    setLogPath(statePath);
    info('session:switch', { cwd: ctx.cwd });
  });

  pi.on('session_shutdown', async () => {
    info('session:shutdown', { schedulerWasRunning: scheduler?.isRunning() ?? false });
    if (scheduler?.isRunning()) {
      scheduler.stop();
      scheduler = null;
    }
  });

  // ── Command: /cron ─────────────────────────────────────────

  pi.registerCommand('cron', {
    description: 'Toggle cron scheduler: /cron on | /cron off | /cron status',
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();

      if (arg === 'on' || arg === 'start') {
        const result = await startScheduler();
        ctx.ui?.notify(result, result.startsWith('✓') ? 'info' : 'error');
      } else if (arg === 'off' || arg === 'stop') {
        const result = await stopScheduler();
        ctx.ui?.notify(result, result.startsWith('✓') ? 'info' : 'error');
      } else {
        const active = scheduler?.isRunning() ?? false;
        const state = await readState(statePath);
        const lines = [
          `Scheduler: ${active ? '✅ active' : '⏸ inactive'}`,
          `Jobs: ${state.jobs.length}`,
        ];
        ctx.ui?.notify(lines.join(' · '), 'info');
      }
    },
  });

  // ── Tool: cron ─────────────────────────────────────────────

  pi.registerTool({
    name: 'cron',
    label: 'Cron',
    description:
      'Manage scheduled cron jobs. ' +
      'Actions: list, add, update, remove, enable, disable, run. ' +
      'Jobs are stored globally and persist across sessions.',
    parameters: CronParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        logError('tool:no-state-path');
        return {
          content: [{ type: 'text', text: 'Error: no state path' }],
          details: {},
        };
      }
      statePath = resolvedPath;
      info('tool:execute', { action: params.action, name: params.name });
      const state = await readState(statePath);
      let result: string;

      switch (params.action) {
        case 'list': {
          if (state.jobs.length === 0) {
            result = 'No cron jobs configured.';
          } else {
            const running = scheduler?.getRunningNames() ?? [];
            const lines = state.jobs.map((j) => {
              const status = j.disabled
                ? '⏸ disabled'
                : running.includes(j.name)
                  ? '🔄 running'
                  : '✅ active';
              const ch = j.channel !== 'cron' ? ` [${j.channel}]` : '';
              const mdl = j.model ? ` (${j.model})` : '';
              return `- **${j.name}** \`${j.schedule}\` ${status}${ch}${mdl}\n  ${j.prompt.slice(0, 80)}`;
            });
            const note = scheduler?.isRunning()
              ? ''
              : '\n\n⚠️ Scheduler is inactive. Use `/cron on` to start.';
            result = `**Cron Jobs (${state.jobs.length}):**\n\n${lines.join('\n\n')}${note}`;
          }
          break;
        }

        case 'add': {
          if (!params.name || !params.schedule || !params.prompt) {
            result = 'Missing required fields: name, schedule, and prompt.';
            break;
          }
          const err = validateCron(params.schedule);
          if (err) {
            result = `Invalid cron expression: ${err}`;
            break;
          }
          if (state.jobs.find((j) => j.name === params.name)) {
            result = `Job "${params.name}" already exists.`;
            break;
          }
          const newJob: CronJob = {
            name: params.name,
            schedule: params.schedule,
            prompt: params.prompt,
            channel: params.channel ?? 'cron',
            disabled: false,
          };
          if (params.model) newJob.model = params.model;
          state.jobs.push(newJob);
          await writeState(statePath, state);
          scheduler?.updateJobs(state.jobs);
          result = `✓ Added cron job "${params.name}" (${params.schedule})`;
          break;
        }

        case 'update': {
          if (!params.name) {
            result = 'Missing required field: name';
            break;
          }
          const job = state.jobs.find((j) => j.name === params.name);
          if (!job) {
            result = `Job "${params.name}" not found.`;
            break;
          }
          if (params.schedule) {
            const err = validateCron(params.schedule);
            if (err) {
              result = `Invalid cron expression: ${err}`;
              break;
            }
            job.schedule = params.schedule;
          }
          if (params.prompt) job.prompt = params.prompt;
          if (params.channel) job.channel = params.channel;
          if (params.model !== undefined) job.model = params.model || undefined;
          await writeState(statePath, state);
          scheduler?.updateJobs(state.jobs);
          result = `✓ Updated "${params.name}"`;
          break;
        }

        case 'remove': {
          if (!params.name) {
            result = 'Missing required field: name';
            break;
          }
          const idx = state.jobs.findIndex((j) => j.name === params.name);
          if (idx === -1) {
            result = `Job "${params.name}" not found.`;
            break;
          }
          state.jobs.splice(idx, 1);
          await writeState(statePath, state);
          scheduler?.updateJobs(state.jobs);
          result = `✓ Removed "${params.name}"`;
          break;
        }

        case 'enable': {
          if (!params.name) {
            result = 'Missing required field: name';
            break;
          }
          const job = state.jobs.find((j) => j.name === params.name);
          if (!job) {
            result = `Job "${params.name}" not found.`;
            break;
          }
          job.disabled = false;
          await writeState(statePath, state);
          scheduler?.updateJobs(state.jobs);
          result = `✓ Enabled "${params.name}"`;
          break;
        }

        case 'disable': {
          if (!params.name) {
            result = 'Missing required field: name';
            break;
          }
          const job = state.jobs.find((j) => j.name === params.name);
          if (!job) {
            result = `Job "${params.name}" not found.`;
            break;
          }
          job.disabled = true;
          await writeState(statePath, state);
          scheduler?.updateJobs(state.jobs);
          result = `✓ Disabled "${params.name}"`;
          break;
        }

        case 'run': {
          if (!params.name) {
            result = 'Missing required field: name';
            break;
          }
          const runJob = state.jobs.find((j) => j.name === params.name);
          if (!runJob) {
            result = `Job "${params.name}" not found.`;
            break;
          }
          // Run directly — no scheduler required. The scheduler is for
          // timed execution; ad-hoc "run now" just spawns the subprocess.
          info('job:trigger-adhoc', {
            job: runJob.name,
            model: runJob.model ?? 'default',
          });
          result = `✓ Triggered "${params.name}" — running in background`;
          {
            // Fire-and-forget: spawn subprocess + record result
            const startedAt = new Date();
            runPiSubprocess(runJob.prompt, runJob.model)
              .then(async (sub) => {
                const durationMs = Date.now() - startedAt.getTime();
                const ok = sub.exitCode === 0 || !!sub.stdout;
                const runResult: CronRunResult = {
                  jobName: runJob.name,
                  startedAt: startedAt.toISOString(),
                  durationMs,
                  ok,
                  error: ok ? undefined : (sub.stderr || `Exit code ${sub.exitCode}`).slice(0, 2000),
                };
                if (ok) {
                  info('job:adhoc-complete', { job: runJob.name, durationMs });
                } else {
                  logError('job:adhoc-failed', {
                    job: runJob.name,
                    durationMs,
                    error: runResult.error?.slice(0, 500),
                  });
                }
                await appendRunResult(runResult);
              })
              .catch((err) => {
                logError('job:adhoc-crash', {
                  job: runJob.name,
                  error: err instanceof Error ? err.message : 'unknown',
                });
              });
          }
          break;
        }

        default:
          result = `Unknown action: ${params.action}`;
      }

      return {
        content: [{ type: 'text' as const, text: result }],
        details: {},
      };
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('cron '));
      text += theme.fg('muted', args.action);
      if (args.name) text += ` ${theme.fg('accent', args.name)}`;
      if (args.schedule) text += ` ${theme.fg('dim', args.schedule)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:') || msg.includes('not found')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(
        theme.fg('success', '✓ ') + theme.fg('muted', msg),
        0,
        0,
      );
    },
  });
}
