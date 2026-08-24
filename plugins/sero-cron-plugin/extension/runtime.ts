import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type {
  CronRunResult,
  CronState,
  NotificationSettings,
  Reminder,
} from '../shared/types';
import { MAX_RUN_RESULTS } from '../shared/types';
import type { ActionDeps, ActionParams } from './actions';
import {
  handleAdd,
  handleList,
  handleRemove,
  handleRun,
  handleToggle,
  handleUpdate,
} from './actions';
import { initLogger, setLogPath, info, warn, error as logError } from './logger';
import { initNotifier, notifyReminder, notifyJobComplete } from './notifier';
import { prepareRecoveryBootstrap } from './recovery-runtime';
import type { ReminderActionDeps, ReminderParams } from './reminder-actions';
import {
  handleReminderAdd,
  handleReminderComplete,
  handleReminderList,
  handleReminderRemove,
  handleReminderSnooze,
  handleReminderToggle,
  handleReminderUpdate,
} from './reminder-actions';
import type { CronCommandContext, CronRuntime, CronToolContext, ToolTextResult } from './runtime-helpers';
import {
  formatRuntimeError,
  getSchedulerStartOpts,
  readNotificationSettingsOrWarn,
  textToolResult,
  toolError,
} from './runtime-helpers';
import { CronScheduler } from './scheduler';
import { resolveStatePath, withStateLock, readState, writeState } from './state-io';
import { StateWatcher } from './state-watcher';

export function createCronRuntime(): CronRuntime {
  let statePath = '';
  let workspaceCwd = '';
  let scheduler: CronScheduler | null = null;
  let stateWatcher: StateWatcher | null = null;
  let initialized = false;
  let sessionRefCount = 0;

  function notifyMissedReminder(
    reminder: Reminder,
    missedAt: Date,
    settings?: NotificationSettings,
  ): void {
    const time = missedAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const body = reminder.notes
      ? `(Missed at ${time}) ${reminder.title}\n${reminder.notes}`
      : `(Missed at ${time}) ${reminder.title}`;
    notifyReminder({ ...reminder, notes: body }, settings);
    info('recovery:notify-reminder', {
      id: reminder.id,
      title: reminder.title,
      missedAt: missedAt.toISOString(),
    });
  }

  async function appendRunResult(result: CronRunResult): Promise<void> {
    if (!statePath) return;
    await withStateLock(statePath, async () => {
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
    await withStateLock(statePath, async () => {
      const state = await readState(statePath);
      const index = state.reminders.findIndex((entry) => entry.id === updated.id);
      if (index >= 0) {
        state.reminders[index] = updated;
        stateWatcher?.markOwnWrite();
        await writeState(statePath, state);
      }
    });
  }

  function createScheduler(): CronScheduler {
    return new CronScheduler({
      onJobComplete: async (result) => {
        await appendRunResult(result).catch(() => {});
        const notificationSettings = statePath
          ? await readNotificationSettingsOrWarn(statePath, warn, 'job')
          : undefined;
        notifyJobComplete(
          result.jobName,
          result.ok,
          result.durationMs,
          notificationSettings,
        );
      },
      onReminderFire: async (reminder) => {
        const notificationSettings = statePath
          ? await readNotificationSettingsOrWarn(statePath, warn, 'reminder')
          : undefined;
        notifyReminder(reminder, notificationSettings);
      },
      onReminderUpdate: (updated) => {
        persistReminderUpdate(updated).catch(() => {});
      },
    });
  }

  function createAndStartScheduler(state: CronState): CronState {
    const prepared = prepareRecoveryBootstrap(state, {
      notifyReminder: notifyMissedReminder,
    });

    scheduler = createScheduler();
    scheduler.start(
      prepared.state.jobs,
      workspaceCwd,
      prepared.state.reminders,
      prepared.startOpts ?? getSchedulerStartOpts(prepared.state),
    );

    for (const jobName of prepared.missedJobNames) {
      info('recovery:run-job', { job: jobName });
      scheduler.runNow(jobName);
    }

    return prepared.state;
  }

  function startStateWatcher(): void {
    stateWatcher?.stop();
    if (!statePath) return;
    stateWatcher = new StateWatcher(statePath, () => scheduler);
    stateWatcher.start();
  }

  async function ensureInitialized(cwd: string): Promise<void> {
    if (initialized) return;
    initialized = true;

    statePath = resolveStatePath(cwd);
    workspaceCwd = cwd;
    info('init', { cwd, statePath });

    if (process.env.SERO_CRON_SUBPROCESS) {
      info('init:subprocess-mode');
      return;
    }

    await withStateLock(statePath, async () => {
      const initialState = await readState(statePath);
      const hasWork =
        initialState.jobs.length > 0 || (initialState.reminders?.length ?? 0) > 0;

      if (initialState.autostart && hasWork) {
        info('scheduler:autostart', {
          jobs: initialState.jobs.length,
          reminders: initialState.reminders.length,
        });
        const state = createAndStartScheduler(initialState);
        state.schedulerActive = true;
        await writeState(statePath, state);
        startStateWatcher();
        return;
      }

      if (initialState.schedulerActive) {
        info('scheduler:reset-stale-flag');
        initialState.schedulerActive = false;
        await writeState(statePath, initialState);
      }
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

    const state = await withStateLock(statePath, async () => {
      const started = createAndStartScheduler(await readState(statePath));
      started.schedulerActive = true;
      await writeState(statePath, started);
      return started;
    });
    startStateWatcher();

    const activeReminders = state.reminders.filter(
      (entry) => entry.status === 'active' || entry.status === 'snoozed',
    ).length;
    info('scheduler:started', {
      jobs: state.jobs.length,
      activeReminders,
    });
    return `✓ Scheduler started (${state.jobs.length} jobs, ${activeReminders} reminders)`;
  }

  async function stopScheduler(): Promise<string> {
    const activeScheduler = scheduler;
    if (!activeScheduler?.isRunning()) {
      warn('scheduler:stop-skipped', { reason: 'not running' });
      return 'Scheduler is not running.';
    }

    stateWatcher?.stop();
    stateWatcher = null;
    await withStateLock(statePath, async () => {
      const state = await readState(statePath);
      state.lastTickMinute = activeScheduler.getLastTickMinute();
      state.lastSchedulerShutdown = new Date().toISOString();
      state.schedulerActive = false;
      activeScheduler.stop();
      if (scheduler === activeScheduler) scheduler = null;
      await writeState(statePath, state);
    });
    return '✓ Scheduler stopped';
  }

  async function executeCronTool(
    params: ActionParams,
    ctx?: CronToolContext,
  ): Promise<ToolTextResult> {
    try {
      if (ctx?.cwd) await ensureInitialized(ctx.cwd);
      const resolvedPath = ctx?.cwd ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) return toolError('no state path');

      const result = await withStateLock(resolvedPath, async () => {
        const state = await readState(resolvedPath);
        const deps: ActionDeps = {
          state,
          statePath: resolvedPath,
          scheduler,
          workspaceCwd,
          writeState,
          appendRunResult,
          ctxCwd: ctx?.cwd,
        };
        switch (params.action) {
          case 'list':
            return handleList(deps);
          case 'add':
            return handleAdd(params, deps);
          case 'update':
            return handleUpdate(params, deps);
          case 'remove':
            return handleRemove(params, deps);
          case 'enable':
            return handleToggle(params, deps, false);
          case 'disable':
            return handleToggle(params, deps, true);
          case 'run':
            return handleRun(params, deps);
          default:
            return `Unknown action: ${params.action}`;
        }
      });

      return textToolResult(result);
    } catch (error) {
      return toolError(formatRuntimeError(error));
    }
  }

  async function executeReminderTool(
    params: ReminderParams,
    ctx?: CronToolContext,
  ): Promise<ToolTextResult> {
    try {
      if (ctx?.cwd) await ensureInitialized(ctx.cwd);
      const resolvedPath = ctx?.cwd ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) return toolError('no state path');

      const result = await withStateLock(resolvedPath, async () => {
        const state = await readState(resolvedPath);
        const deps: ReminderActionDeps = {
          state,
          statePath: resolvedPath,
          writeState,
        };

        let response: string;
        switch (params.action) {
          case 'list':
            response = handleReminderList(deps);
            break;
          case 'add':
            response = await handleReminderAdd(params, deps);
            break;
          case 'update':
            response = await handleReminderUpdate(params, deps);
            break;
          case 'remove':
            response = await handleReminderRemove(params, deps);
            break;
          case 'snooze':
            response = await handleReminderSnooze(params, deps);
            break;
          case 'complete':
            response = await handleReminderComplete(params, deps);
            break;
          case 'enable':
            response = await handleReminderToggle(params, deps, false);
            break;
          case 'disable':
            response = await handleReminderToggle(params, deps, true);
            break;
          default:
            response = `Unknown action: ${params.action}`;
        }

        scheduler?.updateReminders(state.reminders);
        return response;
      });

      return textToolResult(result);
    } catch (error) {
      return toolError(formatRuntimeError(error));
    }
  }

  function attachPi(pi: ExtensionAPI): void {
    initNotifier(pi.events.emit.bind(pi.events));

    if (statePath) {
      initLogger(pi, statePath);
    }

    const seroHome = process.env.SERO_HOME;
    if (seroHome && !process.env.SERO_CRON_SUBPROCESS && !initialized) {
      const globalCwd = path.join(seroHome, 'workspaces', 'global');
      initLogger(pi, resolveStatePath(globalCwd));
      ensureInitialized(globalCwd).catch((error) => {
        console.error('[cron] eager init failed:', error);
      });
    }
  }

  async function handleSessionStart(
    pi: ExtensionAPI,
    ctx: { cwd: string },
  ): Promise<void> {
    if (!initialized) {
      initLogger(pi, resolveStatePath(ctx.cwd));
    }
    await ensureInitialized(ctx.cwd);
    sessionRefCount++;
    info('session:start', { cwd: ctx.cwd, refCount: sessionRefCount });
  }

  function handleSessionSwitch(ctx: { cwd: string }): void {
    const newPath = resolveStatePath(ctx.cwd);
    if (newPath === statePath) {
      setLogPath(statePath);
    } else {
      warn('session:switch-path-mismatch', {
        current: statePath,
        requested: newPath,
        hint: 'Ignoring — scheduler bound to original state path',
      });
    }
    info('session:switch', { cwd: ctx.cwd });
  }

  async function handleSessionShutdown(): Promise<void> {
    sessionRefCount = Math.max(0, sessionRefCount - 1);
    info('session:shutdown', {
      refCount: sessionRefCount,
      schedulerRunning: scheduler?.isRunning() ?? false,
    });

    if (sessionRefCount !== 0) {
      return;
    }

    stateWatcher?.stop();
    stateWatcher = null;
    const activeScheduler = scheduler;
    if (activeScheduler?.isRunning()) {
      if (statePath) {
        try {
          await withStateLock(statePath, async () => {
            const state = await readState(statePath);
            state.lastTickMinute = activeScheduler.getLastTickMinute();
            state.lastSchedulerShutdown = new Date().toISOString();
            await writeState(statePath, state);
          });
        } catch (error) {
          warn('scheduler:shutdown-state-write-skipped', {
            path: statePath,
            error: formatRuntimeError(error),
          });
        }
      }
      activeScheduler.stop();
      if (scheduler === activeScheduler) scheduler = null;
    }
    initialized = false;
  }

  async function handleCronCommand(
    args?: string,
    ctx?: CronCommandContext,
  ): Promise<void> {
    try {
      if (ctx?.cwd) {
        await ensureInitialized(ctx.cwd);
      }
      const arg = args?.trim().toLowerCase();
      if (arg === 'on' || arg === 'start') {
        const result = await startScheduler();
        ctx?.ui?.notify(result, result.startsWith('✓') ? 'info' : 'error');
        return;
      }
      if (arg === 'off' || arg === 'stop') {
        const result = await stopScheduler();
        ctx?.ui?.notify(result, result.startsWith('✓') ? 'info' : 'error');
        return;
      }

      const active = scheduler?.isRunning() ?? false;
      const state = await readState(statePath);
      const reminderCount = state.reminders.filter(
        (entry) => entry.status === 'active' || entry.status === 'snoozed',
      ).length;
      ctx?.ui?.notify(
        `Scheduler: ${active ? '✅ active' : '⏸ inactive'} · Jobs: ${state.jobs.length} · Reminders: ${reminderCount}`,
        'info',
      );
    } catch (error) {
      const message = formatRuntimeError(error);
      ctx?.ui?.notify(
        message.startsWith('Error:') ? message : `Error: ${message}`,
        'error',
      );
    }
  }

  return {
    attachPi,
    handleSessionStart,
    handleSessionSwitch,
    handleSessionShutdown,
    handleCronCommand,
    executeCronTool,
    executeReminderTool,
  };
}
