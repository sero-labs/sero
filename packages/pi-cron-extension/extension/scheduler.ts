/**
 * Cron scheduler — ticks every 30s, matches jobs against local time,
 * and spawns isolated `pi -p` subprocesses.
 *
 * Adapted from pi-cron for Sero's JSON state format.
 */

import { spawn } from 'node:child_process';
import type { CronJob, CronRunResult } from '../shared/types';
import { matchesCron } from '../shared/cron';
import { info, warn, error as logError } from './logger';

// ── Subprocess runner ───────────────────────────────────────────

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runPiSubprocess(
  prompt: string,
  model?: string,
  timeoutMs = 600_000,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const args = ['-p', '--no-session', '--no-extensions'];
    if (model) args.push('--model', model);
    args.push(prompt);

    info('subprocess:spawn', {
      model: model ?? 'default',
      promptLen: prompt.length,
      timeoutMs,
    });

    const child = spawn('pi', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      const level = code === 0 || stdout ? 'ok' : 'fail';
      info('subprocess:exit', {
        exitCode: code ?? 1,
        level,
        stdoutLen: stdout.length,
        stderrLen: stderr.length,
      });
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      logError('subprocess:error', { error: err.message });
      resolve({ stdout, stderr: `${stderr}\n${err.message}`, exitCode: 1 });
    });
  });
}

// ── Event types ─────────────────────────────────────────────────

export interface SchedulerCallbacks {
  onJobStart?: (job: CronJob) => void;
  onJobComplete?: (result: CronRunResult) => void;
}

// ── Scheduler ───────────────────────────────────────────────────

const TICK_INTERVAL_MS = 30_000;

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickMinute = '';
  private running = new Set<string>();
  private jobs: CronJob[] = [];
  private callbacks: SchedulerCallbacks;

  constructor(callbacks?: SchedulerCallbacks) {
    this.callbacks = callbacks ?? {};
  }

  // ── Lifecycle ───────────────────────────────────────────

  start(jobs: CronJob[]): void {
    if (this.timer) return;
    this.jobs = jobs;
    const enabled = jobs.filter((j) => !j.disabled).length;
    info('scheduler:start', { totalJobs: jobs.length, enabled });
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

  /** Get names of currently executing jobs. */
  getRunningNames(): string[] {
    return [...this.running];
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

    // Only fire once per minute
    if (currentMinute === this.lastTickMinute) return;
    this.lastTickMinute = currentMinute;

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

  private async execute(job: CronJob): Promise<void> {
    const startedAt = new Date();
    info('job:start', {
      job: job.name,
      model: job.model ?? 'default',
      promptLen: job.prompt.length,
    });
    this.callbacks.onJobStart?.(job);

    try {
      const result = await runPiSubprocess(job.prompt, job.model);
      const durationMs = Date.now() - startedAt.getTime();

      if (result.exitCode !== 0 && !result.stdout) {
        throw new Error(
          result.stderr || `Process exited with code ${result.exitCode}`,
        );
      }

      info('job:complete', { job: job.name, durationMs, ok: true });
      this.callbacks.onJobComplete?.({
        jobName: job.name,
        startedAt: startedAt.toISOString(),
        durationMs,
        ok: true,
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
