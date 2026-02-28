/**
 * Cron scheduler — ticks every 30s, matches jobs against local time,
 * and spawns isolated `pi -p` subprocesses.
 *
 * Adapted from pi-cron for Sero's JSON state format.
 */

import { spawn } from 'node:child_process';
import type { CronJob, CronRunResult } from '../shared/types';
import { matchesCron } from '../shared/cron';

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
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
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
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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
    if (this.running.has(name)) return `Job "${name}" is already running.`;

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
      } catch {
        continue;
      }

      this.running.add(job.name);
      this.execute(job).finally(() => this.running.delete(job.name));
    }
  }

  private async execute(job: CronJob): Promise<void> {
    const startedAt = new Date();
    this.callbacks.onJobStart?.(job);

    try {
      const result = await runPiSubprocess(job.prompt, job.model);
      const durationMs = Date.now() - startedAt.getTime();

      if (result.exitCode !== 0 && !result.stdout) {
        throw new Error(
          result.stderr || `Process exited with code ${result.exitCode}`,
        );
      }

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
