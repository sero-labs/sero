/**
 * Cron Extension — Pi extension for managing scheduled cron jobs and reminders.
 *
 * Global-scoped: state at ~/.sero-ui/apps/cron/state.json (Sero)
 * or .sero/apps/cron/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: current_time, cron, reminder
 * Commands: /cron
 *
 * IMPORTANT: The scheduler is a MODULE-LEVEL singleton. The default export
 * may be called multiple times (once per Sero session), but only one
 * scheduler exists per process. This prevents double job execution.
 */

import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { CronRunResult, Reminder } from '../shared/types';
import { MAX_RUN_RESULTS } from '../shared/types';
import { resolveStatePath, withStateLock, readState, writeState } from './state-io';
import { CronScheduler } from './scheduler';
import { StateWatcher } from './state-watcher';
import { initLogger, setLogPath, info, warn, error as logError } from './logger';
import { initNotifier, notifyReminder, notifyJobComplete } from './notifier';
import {
  handleList, handleAdd, handleUpdate, handleRemove,
  handleToggle, handleRun, type ActionDeps,
} from './actions';
import {
  handleReminderList, handleReminderAdd, handleReminderUpdate,
  handleReminderRemove, handleReminderSnooze, handleReminderComplete,
  handleReminderToggle, type ReminderActionDeps,
} from './reminder-actions';

// ── Module-level singleton state ───────────────────────────────
// Shared across all invocations of the default export (multiple sessions).

let statePath = '';
let workspaceCwd = '';
let scheduler: CronScheduler | null = null;
let stateWatcher: StateWatcher | null = null;
let initialized = false;

function getStatePath(): string { return statePath; }
function getScheduler(): CronScheduler | null { return scheduler; }
function getCwd(): string { return workspaceCwd; }

// ── Scheduler helpers (module-level, use singleton state) ──────

async function appendRunResult(result: CronRunResult): Promise<void> {
  if (!statePath) return;
  await withStateLock(async () => {
    const state = await readState(statePath);
    state.lastRunResults.unshift(result);
    if (state.lastRunResults.length > MAX_RUN_RESULTS) {
      state.lastRunResults = state.lastRunResults.slice(0, MAX_RUN_RESULTS);
    }
    stateWatcher?.markOwnWrite();
    await writeState(statePath, state);
  });
}

async function persistReminderUpdate(updated: Reminder): Promise<void> {
  if (!statePath) return;
  await withStateLock(async () => {
    const state = await readState(statePath);
    const idx = state.reminders.findIndex((r) => r.id === updated.id);
    if (idx >= 0) {
      state.reminders[idx] = updated;
      stateWatcher?.markOwnWrite();
      await writeState(statePath, state);
    }
  });
}

function createScheduler(): CronScheduler {
  return new CronScheduler({
    onJobComplete: async (result) => {
      await appendRunResult(result).catch(() => {});
      const state = statePath ? await readState(statePath) : null;
      notifyJobComplete(result.jobName, result.ok, result.durationMs, state?.notificationSettings ?? undefined);
    },
    onReminderFire: async (reminder) => {
      const state = statePath ? await readState(statePath) : null;
      notifyReminder(reminder, state?.notificationSettings ?? undefined);
    },
    onReminderUpdate: (updated) => { persistReminderUpdate(updated).catch(() => {}); },
  });
}

function startStateWatcher(): void {
  stateWatcher?.stop();
  if (!statePath) return;
  stateWatcher = new StateWatcher(statePath, () => scheduler);
  stateWatcher.start();
}

// ── Initialization (runs once per process) ─────────────────────

async function ensureInitialized(cwd: string): Promise<void> {
  if (initialized) return;
  initialized = true;

  statePath = resolveStatePath(cwd);
  workspaceCwd = cwd;
  // Logger init needs a pi ref — deferred to first pi.on or tool call
  info('init', { cwd, statePath });

  if (process.env.SERO_CRON_SUBPROCESS) {
    info('init:subprocess-mode');
    return;
  }

  const state = await readState(statePath);
  const hasWork = state.jobs.length > 0 || (state.reminders?.length ?? 0) > 0;

  if (state.autostart && hasWork) {
    info('scheduler:autostart', { jobs: state.jobs.length, reminders: state.reminders.length });
    scheduler = createScheduler();
    scheduler.start(state.jobs, workspaceCwd, state.reminders);
    startStateWatcher();
    stateWatcher?.markOwnWrite();
    state.schedulerActive = true;
    await writeState(statePath, state);
  } else if (state.schedulerActive) {
    info('scheduler:reset-stale-flag');
    state.schedulerActive = false;
    await writeState(statePath, state);
  }
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
  scheduler.start(state.jobs, workspaceCwd, state.reminders);
  startStateWatcher();
  state.schedulerActive = true;
  await writeState(statePath, state);
  const activeReminders = state.reminders.filter(
    (r) => r.status === 'active' || r.status === 'snoozed',
  ).length;
  info('scheduler:started', { jobs: state.jobs.length, activeReminders });
  return `✓ Scheduler started (${state.jobs.length} jobs, ${activeReminders} reminders)`;
}

async function stopScheduler(): Promise<string> {
  if (!scheduler?.isRunning()) {
    warn('scheduler:stop-skipped', { reason: 'not running' });
    return 'Scheduler is not running.';
  }
  stateWatcher?.stop();
  stateWatcher = null;
  scheduler.stop();
  scheduler = null;
  if (statePath) {
    const state = await readState(statePath);
    state.schedulerActive = false;
    await writeState(statePath, state);
  }
  return '✓ Scheduler stopped';
}

// ── Tool parameter schemas ─────────────────────────────────────

const CronParams = Type.Object({
  action: StringEnum(['list', 'add', 'update', 'remove', 'enable', 'disable', 'run'] as const),
  name: Type.Optional(Type.String({ description: 'Job name (required for all except list)' })),
  schedule: Type.Optional(Type.String({
    description: 'Cron expression: "min hour dom month dow". Example: "0 9 * * 1-5" = weekdays at 9am',
  })),
  prompt: Type.Optional(Type.String({ description: 'Prompt to send to the agent when the job fires' })),
  channel: Type.Optional(Type.String({ description: 'Channel tag for grouping (default: "cron")' })),
  model: Type.Optional(Type.String({ description: 'Model pattern or ID. Omit for default.' })),
});

const ReminderParams = Type.Object({
  action: StringEnum(['list', 'add', 'update', 'remove', 'snooze', 'complete', 'enable', 'disable'] as const),
  id: Type.Optional(Type.String({ description: 'Reminder ID (required for all except list/add)' })),
  title: Type.Optional(Type.String({ description: 'Reminder title (required for add)' })),
  notes: Type.Optional(Type.String({ description: 'Optional notes or details' })),
  channel: Type.Optional(Type.String({ description: 'Delivery channel: "notification" (default) or "email"' })),
  type: Type.Optional(Type.String({ description: '"once" (default) or "recurring"' })),
  fire_at: Type.Optional(Type.String({
    description: 'ISO datetime for one-time reminders. IMPORTANT: call current_time first to get the accurate current time.',
  })),
  schedule: Type.Optional(Type.String({ description: 'Cron expression for recurring reminders' })),
  snooze_minutes: Type.Optional(Type.Number({ description: 'Snooze duration in minutes (default: 15). -1 for tomorrow 9am.' })),
});

// ── Extension factory (called per session) ─────────────────────

export default function (pi: ExtensionAPI) {
  console.log('[cron] extension loaded');

  // Wire notification emitter (last writer wins — all pi instances share the same EventBus)
  initNotifier(pi.events.emit.bind(pi.events));

  // Initialize logger with pi ref (needed for console prefix)
  // Only the first call sets the file path; subsequent calls update the pi ref.
  if (statePath) {
    initLogger(pi, statePath);
  }

  // Eagerly initialize in Sero mode (once per process)
  const seroHome = process.env.SERO_HOME;
  if (seroHome && !process.env.SERO_CRON_SUBPROCESS && !initialized) {
    const globalCwd = path.join(seroHome, 'workspaces', 'global');
    initLogger(pi, resolveStatePath(globalCwd));
    ensureInitialized(globalCwd).catch((err) => {
      console.error('[cron] eager init failed:', err);
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    if (!initialized) initLogger(pi, resolveStatePath(ctx.cwd));
    await ensureInitialized(ctx.cwd);
    info('session:start', { cwd: ctx.cwd });
  });

  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
    setLogPath(statePath);
    info('session:switch', { cwd: ctx.cwd });
  });

  pi.on('session_shutdown', async () => {
    info('session:shutdown', { schedulerWasRunning: scheduler?.isRunning() ?? false });
    stateWatcher?.stop();
    stateWatcher = null;
    if (scheduler?.isRunning()) { scheduler.stop(); scheduler = null; }
  });

  // ── Command: /cron ─────────────────────────────────────────

  pi.registerCommand('cron', {
    description: 'Toggle scheduler: /cron on | /cron off | /cron status',
    handler: async (args, ctx) => {
      if (ctx.cwd) await ensureInitialized(ctx.cwd);
      const arg = args?.trim().toLowerCase();
      if (arg === 'on' || arg === 'start') {
        const r = await startScheduler();
        ctx.ui?.notify(r, r.startsWith('✓') ? 'info' : 'error');
      } else if (arg === 'off' || arg === 'stop') {
        const r = await stopScheduler();
        ctx.ui?.notify(r, r.startsWith('✓') ? 'info' : 'error');
      } else {
        const active = scheduler?.isRunning() ?? false;
        const state = await readState(statePath);
        const remCount = state.reminders.filter((r) => r.status === 'active' || r.status === 'snoozed').length;
        ctx.ui?.notify(`Scheduler: ${active ? '✅ active' : '⏸ inactive'} · Jobs: ${state.jobs.length} · Reminders: ${remCount}`, 'info');
      }
    },
  });

  // ── Tool: current_time ─────────────────────────────────────

  pi.registerTool({
    name: 'current_time',
    label: 'Current Time',
    description: 'Get the current date and time. Call this BEFORE creating reminders with relative times.',
    parameters: Type.Object({}),
    async execute() {
      const now = new Date();
      const iso = now.toISOString();
      const local = now.toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
      const offset = -now.getTimezoneOffset();
      const offsetStr = `UTC${offset >= 0 ? '+' : ''}${Math.floor(offset / 60)}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
      return { content: [{ type: 'text' as const, text: `Current time: ${iso}\nLocal: ${local}\nTimezone: ${offsetStr}\nUnix: ${now.getTime()}` }], details: {} };
    },
    renderCall(_args, theme) { return new Text(theme.fg('toolTitle', theme.bold('current_time')), 0, 0); },
    renderResult(result, _o, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(theme.fg('muted', `🕐 ${msg.split('\n')[0]?.replace('Current time: ', '') ?? ''}`), 0, 0);
    },
  });

  // ── Tool: cron ─────────────────────────────────────────────

  registerCronTool(pi);

  // ── Tool: reminder ─────────────────────────────────────────

  registerReminderTool(pi);
}

// ── Tool registrations ─────────────────────────────────────────

function registerCronTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'cron', label: 'Cron',
    description: 'Manage scheduled cron jobs. Actions: list, add, update, remove, enable, disable, run.',
    parameters: CronParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (ctx?.cwd) await ensureInitialized(ctx.cwd);
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : getStatePath();
      if (!resolvedPath) return { content: [{ type: 'text', text: 'Error: no state path' }], details: {} };
      const result = await withStateLock(async () => {
        const state = await readState(resolvedPath);
        const deps: ActionDeps = { state, statePath: resolvedPath, scheduler: getScheduler(), workspaceCwd: getCwd(), writeState, appendRunResult, ctxCwd: ctx?.cwd };
        switch (params.action) {
          case 'list': return handleList(deps);
          case 'add': return handleAdd(params, deps);
          case 'update': return handleUpdate(params, deps);
          case 'remove': return handleRemove(params, deps);
          case 'enable': return handleToggle(params, deps, false);
          case 'disable': return handleToggle(params, deps, true);
          case 'run': return handleRun(params, deps);
          default: return `Unknown action: ${params.action}`;
        }
      });
      return { content: [{ type: 'text' as const, text: result }], details: {} };
    },
    renderCall(args, theme) {
      let t = theme.fg('toolTitle', theme.bold('cron ')); t += theme.fg('muted', args.action);
      if (args.name) t += ` ${theme.fg('accent', args.name)}`;
      return new Text(t, 0, 0);
    },
    renderResult(result, _o, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(msg.startsWith('Error:') ? theme.fg('error', msg) : theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });
}

function registerReminderTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'reminder', label: 'Reminder',
    description: 'Manage reminders with desktop notifications. Actions: list, add, update, remove, snooze, complete, enable, disable. ' +
      'IMPORTANT: For relative times, call current_time first to get accurate time, then compute fire_at.',
    parameters: ReminderParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (ctx?.cwd) await ensureInitialized(ctx.cwd);
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : getStatePath();
      if (!resolvedPath) return { content: [{ type: 'text', text: 'Error: no state path' }], details: {} };
      const result = await withStateLock(async () => {
        const state = await readState(resolvedPath);
        const deps: ReminderActionDeps = { state, statePath: resolvedPath, writeState };
        let res: string;
        switch (params.action) {
          case 'list': res = handleReminderList(deps); break;
          case 'add': res = await handleReminderAdd(params, deps); break;
          case 'update': res = await handleReminderUpdate(params, deps); break;
          case 'remove': res = await handleReminderRemove(params, deps); break;
          case 'snooze': res = await handleReminderSnooze(params, deps); break;
          case 'complete': res = await handleReminderComplete(params, deps); break;
          case 'enable': res = await handleReminderToggle(params, deps, false); break;
          case 'disable': res = await handleReminderToggle(params, deps, true); break;
          default: res = `Unknown action: ${params.action}`;
        }
        getScheduler()?.updateReminders(state.reminders);
        return res;
      });
      return { content: [{ type: 'text' as const, text: result }], details: {} };
    },
    renderCall(args, theme) {
      let t = theme.fg('toolTitle', theme.bold('reminder ')); t += theme.fg('muted', args.action);
      if (args.title) t += ` ${theme.fg('dim', `"${args.title}"`)}`;
      if (args.id) t += ` ${theme.fg('accent', args.id)}`;
      return new Text(t, 0, 0);
    },
    renderResult(result, _o, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(msg.startsWith('Error:') ? theme.fg('error', msg) : msg.startsWith('✓') ? theme.fg('success', '✓ ') + theme.fg('muted', msg.slice(2)) : theme.fg('muted', msg), 0, 0);
    },
  });
}
