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

/** Maximum buffer size per stream (1 MB). Prevents OOM on chatty jobs. */
const MAX_BUFFER = 1_048_576;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SubprocessOptions {
  model?: string;
  cwd?: string;
  timeoutMs?: number;
}

export function runPiSubprocess(
  prompt: string,
  opts: SubprocessOptions = {},
): Promise<RunResult> {
  const { model, cwd, timeoutMs = 600_000 } = opts;

  return new Promise((resolve) => {
    const args = ['-p', '--no-session'];
    if (model) args.push('--model', model);
    args.push(prompt);

    info('subprocess:spawn', {
      model: model ?? 'default',
      cwd: cwd ?? process.cwd(),
      promptLen: prompt.length,
      timeoutMs,
      args: args.slice(0, -1), // log flags, not the full prompt
    });

    let child;
    try {
      child = spawn('pi', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, SERO_CRON_SUBPROCESS: '1' },
        cwd: cwd || undefined,
        timeout: timeoutMs,
      });
    } catch (err) {
      // spawn can throw synchronously (e.g. ENOENT before event loop)
      const msg = err instanceof Error ? err.message : String(err);
      logError('subprocess:spawn-failed', { error: msg });
      resolve({ stdout: '', stderr: msg, exitCode: 1 });
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_BUFFER) {
        stdout += chunk.toString();
        if (stdout.length > MAX_BUFFER) stdout = stdout.slice(0, MAX_BUFFER);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_BUFFER) {
        stderr += chunk.toString();
        if (stderr.length > MAX_BUFFER) stderr = stderr.slice(0, MAX_BUFFER);
      }
    });

    child.on('close', (code) => {
      const ok = code === 0 || !!stdout;
      info('subprocess:exit', {
        exitCode: code ?? 1,
        ok,
        stdoutLen: stdout.length,
        stderrLen: stderr.length,
        // Log first 500 chars of output for debugging
        stdoutPreview: stdout.slice(0, 500),
        ...(stderr && { stderrPreview: stderr.slice(0, 500) }),
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
  private cwd: string | undefined;

  constructor(callbacks?: SchedulerCallbacks) {
    this.callbacks = callbacks ?? {};
  }

  // ── Lifecycle ───────────────────────────────────────────

  start(jobs: CronJob[], cwd?: string): void {
    if (this.timer) return;
    this.jobs = jobs;
    this.cwd = cwd;
    const enabled = jobs.filter((j) => !j.disabled).length;
    info('scheduler:start', { totalJobs: jobs.length, enabled, cwd });
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
      const result = await runPiSubprocess(job.prompt, {
        model: job.model,
        cwd: this.cwd,
      });
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
