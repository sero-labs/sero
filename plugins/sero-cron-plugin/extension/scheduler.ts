/**
 * Cron scheduler — ticks every 30s, matches jobs against local time,
 * runs prompts in transient in-memory sessions, and fires reminders.
 *
 * Jobs execute via session-runner.ts which creates disposable
 * AgentSession instances (SessionManager.inMemory). No orphaned
 * session files, no interference with user sessions.
 */

import type { CronJob, CronRunResult, Reminder } from '../shared/types';
import { matchesCron } from '../shared/cron';
import { shouldFire, statusAfterFire } from '../shared/reminder-utils';
import { runTransientSession, type SessionRunOptions } from './session-runner';
import { info, warn, error as logError } from './logger';

// ── Event types ─────────────────────────────────────────────────

export interface SchedulerCallbacks {
  onJobStart?: (job: CronJob) => void;
  onJobComplete?: (result: CronRunResult) => void;
  /** Called when a reminder fires — the callback should show the notification. */
  onReminderFire?: (reminder: Reminder) => void;
  /** Called after a reminder fires with the updated reminder (for state persistence). */
  onReminderUpdate?: (updated: Reminder) => void;
}

// ── Scheduler ───────────────────────────────────────────────────

const TICK_INTERVAL_MS = 30_000;

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickMinute = '';
  private running = new Set<string>();
  private jobs: CronJob[] = [];
  private reminders: Reminder[] = [];
  private callbacks: SchedulerCallbacks;
  private cwd: string | undefined;

  constructor(callbacks?: SchedulerCallbacks) {
    this.callbacks = callbacks ?? {};
  }

  // ── Lifecycle ───────────────────────────────────────────

  start(
    jobs: CronJob[],
    cwd?: string,
    reminders?: Reminder[],
    opts?: { lastTickMinute?: string },
  ): void {
    if (this.timer) return;
    this.jobs = jobs;
    this.reminders = reminders ?? [];
    this.cwd = cwd;
    // When restarting (e.g. /cron on after /cron off) within the same
    // minute, carry over the previous tick minute to prevent re-firing
    // cron jobs that already ran this minute.
    if (opts?.lastTickMinute) {
      this.lastTickMinute = opts.lastTickMinute;
    }
    const enabled = jobs.filter((j) => !j.disabled).length;
    const activeReminders = this.reminders.filter(
      (r) => r.status === 'active' || r.status === 'snoozed',
    ).length;
    info('scheduler:start', { totalJobs: jobs.length, enabled, activeReminders, cwd });
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      info('scheduler:stop', { runningJobs: [...this.running] });
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Update the jobs list (called when state changes externally). */
  updateJobs(jobs: CronJob[]): void {
    this.jobs = jobs;
  }

  /** Update the reminders list (called when state changes externally). */
  updateReminders(reminders: Reminder[]): void {
    const prev = this.reminders.length;
    this.reminders = reminders;
    const active = reminders.filter(
      (r) => r.status === 'active' || r.status === 'snoozed',
    ).length;
    if (prev !== reminders.length || active > 0) {
      info('scheduler:reminders-updated', {
        previous: prev,
        current: reminders.length,
        active,
      });
    }
  }

  /** Get the count of in-memory reminders (for diagnostics). */
  getReminderCount(): number {
    return this.reminders.length;
  }

  /** Get names of currently executing jobs. */
  getRunningNames(): string[] {
    return [...this.running];
  }

  /** Get the last tick minute key (for carrying over on restart). */
  getLastTickMinute(): string {
    return this.lastTickMinute;
  }

  // ── Run now ─────────────────────────────────────────────

  runNow(name: string): string {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) return `Job "${name}" not found.`;
    if (this.running.has(name)) {
      warn('job:already-running', { job: name });
      return `Job "${name}" is already running.`;
    }

    info('job:trigger-manual', { job: name });
    this.running.add(name);
    this.execute(job).finally(() => this.running.delete(name));
    return `✓ Triggered "${name}"`;
  }

  // ── Tick ──────────────────────────────────────────────────

  private tick(): void {
    const now = new Date();
    const currentMinute = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

    // Only fire cron jobs once per minute (reminders checked every tick)
    const isNewMinute = currentMinute !== this.lastTickMinute;
    if (isNewMinute) this.lastTickMinute = currentMinute;

    // ── Cron jobs (once per minute) ───────────────────────
    if (isNewMinute) {
      for (const job of this.jobs) {
        if (job.disabled || this.running.has(job.name)) continue;

        try {
          if (!matchesCron(job.schedule, now)) continue;
        } catch (err) {
          warn('job:bad-schedule', {
            job: job.name,
            schedule: job.schedule,
            error: err instanceof Error ? err.message : 'parse error',
          });
          continue;
        }

        info('job:trigger-scheduled', { job: job.name, schedule: job.schedule });
        this.running.add(job.name);
        this.execute(job).finally(() => this.running.delete(job.name));
      }
    }

    // ── Reminders (every tick — important for snoozed/once) ─
    this.tickReminders(now);
  }

  private tickReminders(now: Date): void {
    if (this.reminders.length === 0) return;

    for (const reminder of this.reminders) {
      if (!shouldFire(reminder, now)) continue;

      info('reminder:fire', {
        id: reminder.id,
        title: reminder.title,
        type: reminder.type,
        channel: reminder.channel,
      });

      // Notify
      this.callbacks.onReminderFire?.(reminder);

      // Compute post-fire state
      const updated = statusAfterFire(reminder);
      this.callbacks.onReminderUpdate?.(updated);

      // Update in-memory list so we don't re-fire this tick
      const idx = this.reminders.findIndex((r) => r.id === reminder.id);
      if (idx >= 0) this.reminders[idx] = updated;
    }
  }

  private async execute(job: CronJob): Promise<void> {
    const startedAt = new Date();
    info('job:start', {
      job: job.name,
      model: job.model ?? 'default',
      promptLen: job.prompt.length,
    });
    this.callbacks.onJobStart?.(job);

    try {
      // Prepend workspace context so the agent knows the real working
      // directory and never tries to use container paths like /workspace.
      const prompt = this.cwd
        ? `[Your working directory is ${this.cwd}. ` +
          `Use relative paths (e.g. "daily-reports/file.md") to save files here. ` +
          `The path "/workspace" does not exist — always prefer relative paths.]\n\n` +
          job.prompt
        : job.prompt;

      const sessionOpts: SessionRunOptions = {
        model: job.model,
        cwd: this.cwd,
      };

      const result = await runTransientSession(job.name, prompt, sessionOpts);

      if (result.exitCode !== 0 && !result.output) {
        throw new Error(result.error || `Session failed with code ${result.exitCode}`);
      }

      info('job:complete', {
        job: job.name,
        durationMs: result.durationMs,
        ok: true,
        outputLen: result.output.length,
      });
      this.callbacks.onJobComplete?.({
        jobName: job.name,
        startedAt: startedAt.toISOString(),
        durationMs: result.durationMs,
        ok: true,
        output: result.output.slice(0, 4000),
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startedAt.getTime();
      const message =
        err instanceof Error ? err.message.slice(0, 2000) : 'Unknown error';

      logError('job:complete', {
        job: job.name,
        durationMs,
        ok: false,
        error: message.slice(0, 500),
      });
      this.callbacks.onJobComplete?.({
        jobName: job.name,
        startedAt: startedAt.toISOString(),
        durationMs,
        ok: false,
        error: message,
      });
    }
  }
}
