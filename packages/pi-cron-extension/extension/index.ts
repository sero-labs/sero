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

import type { CronState, CronRunResult } from '../shared/types';
import { DEFAULT_CRON_STATE, MAX_RUN_RESULTS } from '../shared/types';
import { CronScheduler } from './scheduler';
import { initLogger, setLogPath, info, warn, error as logError } from './logger';
import {
  handleList, handleAdd, handleUpdate, handleRemove,
  handleToggle, handleRun,
  type ActionDeps,
} from './actions';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'cron', 'state.json');

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'cron', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic writes with mutex) ────────────────────────

/**
 * Simple async mutex to serialise read-modify-write cycles on state.json.
 * Prevents concurrent tool calls or scheduler callbacks from clobbering
 * each other's writes.
 */
let stateMutexQueue: Promise<void> = Promise.resolve();

function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = stateMutexQueue;
  let resolve: () => void;
  stateMutexQueue = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

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
  console.log('[cron] extension loaded');
  let statePath = '';
  let workspaceCwd = '';
  let scheduler: CronScheduler | null = null;

  // ── Scheduler callbacks ────────────────────────────────────

  async function appendRunResult(result: CronRunResult): Promise<void> {
    if (!statePath) return;
    await withStateLock(async () => {
      const state = await readState(statePath);
      state.lastRunResults.unshift(result);
      if (state.lastRunResults.length > MAX_RUN_RESULTS) {
        state.lastRunResults = state.lastRunResults.slice(0, MAX_RUN_RESULTS);
      }
      await writeState(statePath, state);
    });
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
    scheduler.start(state.jobs, workspaceCwd);

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
    workspaceCwd = ctx.cwd;
    initLogger(pi, statePath);
    info('session:start', { cwd: ctx.cwd, statePath });

    // Skip scheduler in cron subprocess to prevent fork-bomb recursion.
    // The subprocess only needs the tool registrations, not the scheduler.
    if (process.env.SERO_CRON_SUBPROCESS) {
      info('session:start:subprocess-mode');
      return;
    }

    const state = await readState(statePath);

    if (state.autostart && state.jobs.length > 0) {
      info('scheduler:autostart', { jobs: state.jobs.length });
      scheduler = createScheduler();
      scheduler.start(state.jobs, workspaceCwd);
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
      initLogger(pi, statePath);
      info('tool:execute', { action: params.action, name: params.name });

      // Serialise state mutations to prevent concurrent read-modify-write races
      const result = await withStateLock(async () => {
        const state = await readState(statePath);
        const deps: ActionDeps = {
          state,
          statePath,
          scheduler,
          workspaceCwd,
          writeState,
          appendRunResult,
          ctxCwd: ctx?.cwd,
        };

        switch (params.action) {
          case 'list':    return handleList(deps);
          case 'add':     return handleAdd(params, deps);
          case 'update':  return handleUpdate(params, deps);
          case 'remove':  return handleRemove(params, deps);
          case 'enable':  return handleToggle(params, deps, false);
          case 'disable': return handleToggle(params, deps, true);
          case 'run':     return handleRun(params, deps);
          default:        return `Unknown action: ${params.action}`;
        }
      });

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
